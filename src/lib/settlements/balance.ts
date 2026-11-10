/**
 * «Взаиморасчёты»: one signed balance per fiscal code across both sides.
 *
 *   salesNet    = salesInvoiced − receivedFromThem     (> 0 they owe us)
 *   purchaseNet = purchasesInvoiced − paidToThem       (> 0 we owe them)
 *   balance     = opening + salesNet − purchaseNet     (> 0 they owe us)
 *
 * `opening` is the carried-over balance from 1C (counterparty_opening_balances):
 * a positive one adds to the sales side, a negative one to the purchase side.
 *
 * The sales side is taken as-is from `computeSalesBalances` (the «Должники»
 * figure). Pure: everything arrives as plain data, amounts are summed in cents.
 */
import type { Prisma } from "@prisma/client";
import type { SalesBalance } from "@/lib/reconciliation/report";
import { resolveCategory } from "./categories";
import { receiptsNotCoveredByCard } from "./cardPurchases";
import type {
  CounterpartyCategoryCode,
  SettlementFlag,
  SettlementRow,
  SettlementState,
  SettlementSummary,
} from "./types";

const DAY_MS = 86_400_000;

export interface SettlementSalesInvoice {
  buyerIdno: string;
  totalAmount: number;
  issueDate: Date | null;
  document: string;
}

/** Incoming bank payment; `ownerIdnos` = whose balance it settles. */
export interface SettlementCredit {
  id: string;
  amount: number;
  bookingDate: Date;
  counterpartyIdno: string | null;
  matchStatus: string;
  /** Buyers its allocations point to; empty = belongs to the payer. */
  allocatedBuyerIdnos: string[];
  documentNumber: string | null;
}

export interface SettlementPurchase {
  supplierIdno: string;
  supplierName: string | null;
  totalAmount: number;
  issueDate: Date | null;
  document: string;
  /** Paid on the spot by fiscal receipt (B/f) — counts as paid in full. */
  receipt?: { ref: string | null; method: string | null; date: Date | null } | null;
}

/** Company-card purchase attributed to a supplier (see cardPurchases.ts). */
export interface SettlementCardPayment {
  /** Bank transaction id — removed from the bank bucket. */
  debitId: string;
  idno: string;
  amount: number;
  /** Card date from the purpose. */
  date: Date;
  merchant: string;
}

export interface SettlementDebit {
  id: string;
  amount: number;
  bookingDate: Date;
  counterpartyIdno: string | null;
  counterpartyName: string | null;
  txTypeCode: string | null;
  documentNumber: string | null;
}

export interface SettlementInput {
  ownIdno: string | null;
  /** Operational IDNOs from Сверка (defaults + «не клиент»). */
  operationalIdnos: ReadonlySet<string>;
  sales: ReadonlyMap<string, SalesBalance>;
  salesInvoices: readonly SettlementSalesInvoice[];
  credits: readonly SettlementCredit[];
  /** Live purchase invoices with totals (rejected / cancelled already dropped). */
  purchases: readonly SettlementPurchase[];
  /** Outgoing bank transactions (any type; filtered here). */
  debits: readonly SettlementDebit[];
  /** Card purchases attributed to suppliers (their debits are skipped above). */
  cardPayments?: readonly SettlementCardPayment[];
  /** Refund share per outgoing transaction id (from credits.ts). */
  refundedByTx: ReadonlyMap<string, number>;
  /** Manual categories by IDNO. */
  categories: ReadonlyMap<string, { category: CounterpartyCategoryCode; name: string | null }>;
  /** Fallback names by IDNO (bank counterparty names). */
  names?: ReadonlyMap<string, string>;
  purchasesWithoutTotals?: number;
  /** Carried-over balances by IDNO, + they owe us. */
  openingBalances?: ReadonlyMap<string, number>;
}

export interface SettlementResult {
  rows: SettlementRow[];
  summary: SettlementSummary;
}

/** Bank transfer to a party (MAIB TD=1); fees (6) and others are not payments. */
export const TRANSFER_TX_TYPE = "1";

const cents = (n: number | Prisma.Decimal): number => Math.round(Number(n) * 100);
const mdl = (c: number): number => c / 100;
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

interface Acc {
  idno: string;
  name: string | null;
  salesInvoiced: number;
  received: number;
  purchases: number;
  paid: number;
  paidCard: number;
  paidReceipt: number;
  opening: number;
  salesInvoiceCount: number;
  purchaseInvoiceCount: number;
  last: number;
  paidOut: Array<{ amount: number; date: Date; document: string }>;
}

function touch(acc: Acc, d: Date | null): void {
  if (d && d.getTime() > acc.last) acc.last = d.getTime();
}

/** Counted share of a debit as a payment to that party (0 when excluded). */
export function supplierPaymentCents(
  debit: SettlementDebit,
  refundedByTx: ReadonlyMap<string, number>,
): number {
  if (debit.txTypeCode !== TRANSFER_TX_TYPE) return 0;
  const rest = cents(debit.amount) - cents(refundedByTx.get(debit.id) ?? 0);
  return rest > 0 ? rest : 0;
}

function stateOf(salesNet: number, purchaseNet: number): SettlementState {
  const balance = salesNet - purchaseNet;
  if (balance === 0) return "settled";
  if (balance > 0) {
    // Which side pushes the balance up: an open sale or a supplier overpayment?
    return Math.max(salesNet, 0) >= Math.max(-purchaseNet, 0) ? "they_owe" : "we_overpaid";
  }
  return Math.max(purchaseNet, 0) >= Math.max(-salesNet, 0) ? "we_owe" : "they_overpaid";
}

function within(a: Date | null, b: Date | null, days: number): boolean {
  if (!a || !b) return false;
  return Math.abs(a.getTime() - b.getTime()) <= days * DAY_MS;
}

/** (a) equal sales invoices ≤ 90 days apart, fewer than two payments of that amount. */
function duplicateSaleFlags(
  invoices: readonly SettlementSalesInvoice[],
  payments: ReadonlyArray<{ amount: number; date: Date }>,
): SettlementFlag[] {
  const flags: SettlementFlag[] = [];
  const sorted = invoices
    .filter((i) => i.issueDate && cents(i.totalAmount) > 0)
    .sort((a, b) => a.issueDate!.getTime() - b.issueDate!.getTime());
  const used = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (!within(a.issueDate, b.issueDate, 90)) break;
      const amount = cents(a.totalAmount);
      if (amount !== cents(b.totalAmount)) continue;
      if (used.has(a.document) || used.has(b.document)) continue;
      const lo = a.issueDate!.getTime() - 30 * DAY_MS;
      const hi = b.issueDate!.getTime() + 120 * DAY_MS;
      const matching = payments.filter(
        (p) => cents(p.amount) === amount && p.date.getTime() >= lo && p.date.getTime() <= hi,
      ).length;
      if (matching >= 2) continue;
      used.add(a.document);
      used.add(b.document);
      flags.push({
        kind: "duplicate_sale",
        amount: mdl(amount),
        dates: [iso(a.issueDate)!, iso(b.issueDate)!],
        documents: [a.document, b.document],
      });
    }
  }
  return flags;
}

/** (d) same amount paid twice ≤ 30 days apart, fewer than two invoices of it. */
function duplicatePaymentFlags(
  paidOut: ReadonlyArray<{ amount: number; date: Date; document: string }>,
  invoices: readonly SettlementPurchase[],
): SettlementFlag[] {
  const flags: SettlementFlag[] = [];
  const sorted = [...paidOut].sort((a, b) => a.date.getTime() - b.date.getTime());
  const used = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (!within(a.date, b.date, 30)) break;
      if (a.amount !== b.amount || used.has(i) || used.has(j)) continue;
      const lo = a.date.getTime() - 90 * DAY_MS;
      const hi = b.date.getTime() + 30 * DAY_MS;
      const matching = invoices.filter(
        (inv) =>
          cents(inv.totalAmount) === a.amount &&
          inv.issueDate &&
          inv.issueDate.getTime() >= lo &&
          inv.issueDate.getTime() <= hi,
      ).length;
      if (matching >= 2) continue;
      used.add(i);
      used.add(j);
      flags.push({
        kind: "duplicate_payment",
        amount: mdl(a.amount),
        dates: [iso(a.date)!, iso(b.date)!],
        documents: [a.document, b.document],
      });
    }
  }
  return flags;
}

export function computeSettlements(input: SettlementInput): SettlementResult {
  const accs = new Map<string, Acc>();
  const get = (idno: string, name: string | null): Acc => {
    let acc = accs.get(idno);
    if (!acc) {
      acc = {
        idno,
        name: null,
        salesInvoiced: 0,
        received: 0,
        purchases: 0,
        paid: 0,
        paidCard: 0,
        paidReceipt: 0,
        opening: 0,
        salesInvoiceCount: 0,
        purchaseInvoiceCount: 0,
        last: 0,
        paidOut: [],
      };
      accs.set(idno, acc);
    }
    if (!acc.name && name && name !== "—") acc.name = name;
    return acc;
  };

  for (const s of input.sales.values()) {
    const acc = get(s.buyerIdno, s.clientName);
    acc.salesInvoiced += cents(s.debits);
    acc.received += cents(s.paid);
    acc.salesInvoiceCount += s.invoiceCount;
    for (const d of s.invoiceDates) touch(acc, d.date);
  }

  const purchasesByIdno = new Map<string, SettlementPurchase[]>();
  for (const p of input.purchases) {
    const acc = get(p.supplierIdno, p.supplierName);
    acc.purchases += cents(p.totalAmount);
    acc.purchaseInvoiceCount += 1;
    touch(acc, p.issueDate);
    const list = purchasesByIdno.get(p.supplierIdno) ?? [];
    list.push(p);
    purchasesByIdno.set(p.supplierIdno, list);
  }

  const cardPayments = input.cardPayments ?? [];
  const cardDebitIds = new Set(cardPayments.map((c) => c.debitId));
  for (const d of input.debits) {
    if (!d.counterpartyIdno || cardDebitIds.has(d.id)) continue;
    const amount = supplierPaymentCents(d, input.refundedByTx);
    if (amount === 0) continue;
    const acc = get(d.counterpartyIdno, d.counterpartyName);
    acc.paid += amount;
    acc.paidOut.push({ amount, date: d.bookingDate, document: d.documentNumber?.trim() || "—" });
    touch(acc, d.bookingDate);
  }

  for (const c of cardPayments) {
    const amount = cents(c.amount);
    if (amount <= 0) continue;
    const acc = get(c.idno, null);
    acc.paid += amount;
    acc.paidCard += amount;
    acc.paidOut.push({ amount, date: c.date, document: c.merchant });
    touch(acc, c.date);
  }

  // B/f-settled supplier invoices count as paid unless a card payment covers them.
  const receipts = receiptsNotCoveredByCard(
    input.purchases.flatMap((p) =>
      p.receipt
        ? [
            {
              document: p.document,
              supplierIdno: p.supplierIdno,
              amount: p.totalAmount,
              date: p.receipt.date ?? p.issueDate ?? new Date(0),
            },
          ]
        : [],
    ),
    cardPayments.map((c) => ({ debitId: c.debitId, idno: c.idno, amount: c.amount, date: c.date })),
  );
  for (const r of receipts) {
    const amount = cents(r.amount);
    if (amount <= 0) continue;
    const acc = get(r.supplierIdno, null);
    acc.paid += amount;
    acc.paidReceipt += amount;
    acc.paidOut.push({ amount, date: r.date, document: r.document });
  }

  for (const [idno, amount] of input.openingBalances ?? []) {
    const c = cents(amount);
    if (c !== 0) get(idno, null).opening += c;
  }

  // Payments per owner (for flags a/b) and sales invoices per buyer.
  const paymentsByOwner = new Map<string, Array<SettlementCredit & { date: Date }>>();
  for (const c of input.credits) {
    const owners = c.allocatedBuyerIdnos.length > 0
      ? c.allocatedBuyerIdnos
      : c.counterpartyIdno
        ? [c.counterpartyIdno]
        : [];
    for (const owner of new Set(owners)) {
      const list = paymentsByOwner.get(owner) ?? [];
      list.push({ ...c, date: c.bookingDate });
      paymentsByOwner.set(owner, list);
    }
    if (c.counterpartyIdno && accs.has(c.counterpartyIdno)) {
      touch(accs.get(c.counterpartyIdno)!, c.bookingDate);
    }
  }
  const salesByBuyer = new Map<string, SettlementSalesInvoice[]>();
  for (const inv of input.salesInvoices) {
    const list = salesByBuyer.get(inv.buyerIdno) ?? [];
    list.push(inv);
    salesByBuyer.set(inv.buyerIdno, list);
  }

  const rows: SettlementRow[] = [];
  const summary: SettlementSummary = {
    theyOwe: 0,
    theyOweCount: 0,
    weOwe: 0,
    weOweCount: 0,
    weOverpaid: 0,
    weOverpaidCount: 0,
    theyOverpaid: 0,
    theyOverpaidCount: 0,
    checkCount: 0,
    unclassifiedCount: 0,
    serviceCount: 0,
    purchasesWithoutTotals: input.purchasesWithoutTotals ?? 0,
  };
  const sumCents = { theyOwe: 0, weOwe: 0, weOverpaid: 0, theyOverpaid: 0 };

  for (const acc of accs.values()) {
    if (input.ownIdno && acc.idno === input.ownIdno) continue;
    if (
      acc.salesInvoiced === 0 &&
      acc.received === 0 &&
      acc.purchases === 0 &&
      acc.paid === 0 &&
      acc.opening === 0
    ) {
      continue;
    }
    const manual = input.categories.get(acc.idno);
    const resolved = resolveCategory({
      idno: acc.idno,
      manual: manual?.category,
      hasPurchaseInvoices: acc.purchaseInvoiceCount > 0,
      hasSalesInvoices: acc.salesInvoiceCount > 0,
      operational: input.operationalIdnos.has(acc.idno),
    });

    const salesNet = acc.salesInvoiced - acc.received;
    const purchaseNet = acc.purchases - acc.paid;
    // Opening balance joins the side it belongs to: + old sales debt, − old purchase debt.
    const openSales = salesNet + Math.max(acc.opening, 0);
    const openPurchases = purchaseNet + Math.max(-acc.opening, 0);
    let state: SettlementState;
    if (resolved.service) state = "service";
    else if (resolved.category === null) state = "unclassified";
    else state = stateOf(openSales, openPurchases);

    const flags: SettlementFlag[] = [];
    if (state !== "service" && state !== "unclassified") {
      const payments = paymentsByOwner.get(acc.idno) ?? [];
      const sales = salesByBuyer.get(acc.idno) ?? [];
      if (openSales > 0) {
        flags.push(...duplicateSaleFlags(sales, payments));
      }
      if (openSales < 0) {
        const orphan = payments.filter(
          (p) =>
            p.counterpartyIdno === acc.idno &&
            p.allocatedBuyerIdnos.length === 0 &&
            p.matchStatus !== "HISTORICAL" &&
            p.matchStatus !== "IGNORED" &&
            !sales.some((s) => within(s.issueDate, p.bookingDate, 60)),
        );
        if (orphan.length > 0) {
          flags.push({
            kind: "payment_without_invoice",
            amount: mdl(orphan.reduce((sum, p) => sum + cents(p.amount), 0)),
            dates: orphan.map((p) => p.bookingDate.toISOString()),
            documents: orphan.map((p) => p.documentNumber?.trim() || "—"),
          });
        }
      }
      const owedToThem = acc.purchases + Math.max(-acc.opening, 0);
      if (
        acc.paid > owedToThem &&
        (acc.purchaseInvoiceCount > 0 || resolved.category === "supplier")
      ) {
        flags.push({
          kind: "supplier_overpaid",
          amount: mdl(acc.paid - owedToThem),
          dates: [],
          documents: [],
        });
      }
      flags.push(...duplicatePaymentFlags(acc.paidOut, purchasesByIdno.get(acc.idno) ?? []));
    }

    const balance = openSales - openPurchases;
    if (state === "they_owe") {
      sumCents.theyOwe += balance;
      summary.theyOweCount += 1;
    } else if (state === "we_overpaid") {
      sumCents.weOverpaid += balance;
      summary.weOverpaidCount += 1;
    } else if (state === "we_owe") {
      sumCents.weOwe -= balance;
      summary.weOweCount += 1;
    } else if (state === "they_overpaid") {
      sumCents.theyOverpaid -= balance;
      summary.theyOverpaidCount += 1;
    } else if (state === "unclassified") {
      summary.unclassifiedCount += 1;
    } else if (state === "service") {
      summary.serviceCount += 1;
    }
    if (flags.length > 0) summary.checkCount += 1;

    rows.push({
      idno: acc.idno,
      name: manual?.name?.trim() || acc.name || input.names?.get(acc.idno) || "—",
      category: resolved.category,
      categorySource: resolved.source,
      salesInvoiced: mdl(acc.salesInvoiced),
      receivedFromThem: mdl(acc.received),
      purchasesInvoiced: mdl(acc.purchases),
      paidToThem: mdl(acc.paid),
      paidByCard: mdl(acc.paidCard),
      paidByReceipt: mdl(acc.paidReceipt),
      salesNet: mdl(salesNet),
      purchaseNet: mdl(purchaseNet),
      openingBalance: mdl(acc.opening),
      balance: mdl(balance),
      state,
      flags,
      salesInvoiceCount: acc.salesInvoiceCount,
      purchaseInvoiceCount: acc.purchaseInvoiceCount,
      lastActivity: acc.last > 0 ? new Date(acc.last).toISOString() : null,
    });
  }

  summary.theyOwe = mdl(sumCents.theyOwe);
  summary.weOwe = mdl(sumCents.weOwe);
  summary.weOverpaid = mdl(sumCents.weOverpaid);
  summary.theyOverpaid = mdl(sumCents.theyOverpaid);

  rows.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name));
  return { rows, summary };
}
