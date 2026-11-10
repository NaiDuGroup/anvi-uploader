import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STATEMENT_EFACTURA_STATUSES } from "@/lib/reconciliation/autoMatch";
import { loadRefunds } from "@/lib/reconciliation/credits";
import { excludeNonDeliveryWhere } from "@/lib/reconciliation/fiscalFlags";
import { computeClientStatement, loadSalesBalanceData } from "@/lib/reconciliation/report";
import { ISSUED_EFACTURA_STATUSES } from "@/lib/efactura/types";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { loadOperationalIdnos } from "@/lib/reconciliation/operational";
import {
  computeSettlements,
  supplierPaymentCents,
  type SettlementDebit,
  type SettlementInput,
  type SettlementPurchase,
} from "./balance";
import { DEFAULT_COUNTERPARTY_CATEGORIES, resolveCategory, SERVICE_CATEGORIES } from "./categories";
import { sliceLedger, withRunningBalance } from "./period";
import {
  attributeCardPurchases,
  receiptsNotCoveredByCard,
  type CardPurchase,
} from "./cardPurchases";
import {
  isCounterpartyCategory,
  type CardMerchantGroup,
  type CardPaymentsSummary,
  type CounterpartyCategoryCode,
  type LedgerEntry,
  type LedgerEntryKind,
  type OpeningBalanceDto,
  type SettlementLedgerResponse,
  type SettlementPeriod,
  type SettlementsResponse,
} from "./types";

/** Purchase documents that count: same live set as sales (no draft / rejected / cancelled). */
export const PURCHASE_BALANCE_STATUSES: readonly number[] = ISSUED_EFACTURA_STATUSES;

const num = (d: Prisma.Decimal | null): number => (d == null ? 0 : Number(d));

function refundedByTx(
  refunds: ReadonlyArray<{ amount: Prisma.Decimal; transaction: { id: string } }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of refunds) {
    map.set(r.transaction.id, (map.get(r.transaction.id) ?? 0) + Number(r.amount));
  }
  return map;
}

async function loadManualCategories(): Promise<SettlementInput["categories"]> {
  const rows = await prisma.counterpartyCategory.findMany({
    select: { idno: true, category: true, name: true },
  });
  const map = new Map<string, { category: CounterpartyCategoryCode; name: string | null }>();
  for (const r of rows) {
    if (isCounterpartyCategory(r.category)) map.set(r.idno, { category: r.category, name: r.name });
  }
  return map;
}

/** Carried-over balances (1C) by IDNO; empty when the table is not migrated yet. */
async function loadOpeningBalances(): Promise<Map<string, number>> {
  try {
    const rows = await prisma.counterpartyOpeningBalance.findMany({
      select: { idno: true, amount: true },
    });
    return new Map(rows.map((r) => [r.idno, Number(r.amount)]));
  } catch (error) {
    console.error("settlements: opening balances not loaded:", error);
    return new Map();
  }
}

export async function loadOpeningBalance(idno: string): Promise<OpeningBalanceDto | null> {
  const row = await prisma.counterpartyOpeningBalance.findUnique({ where: { idno } });
  if (!row) return null;
  return {
    asOfDate: row.asOfDate.toISOString().slice(0, 10),
    amount: Number(row.amount),
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const PURCHASE_SELECT = {
  seria: true,
  number: true,
  supplierIdno: true,
  supplierName: true,
  totalAmount: true,
  issueDate: true,
  receiptRef: true,
  receiptMethod: true,
  receiptSettledAt: true,
} satisfies Prisma.PurchaseInvoiceSelect;

type PurchaseRow = Prisma.PurchaseInvoiceGetPayload<{ select: typeof PURCHASE_SELECT }>;

function toSettlementPurchase(p: PurchaseRow): SettlementPurchase {
  return {
    supplierIdno: p.supplierIdno!,
    supplierName: p.supplierName,
    totalAmount: num(p.totalAmount),
    issueDate: p.issueDate,
    document: `${p.seria}${p.number}`,
    receipt: p.receiptSettledAt
      ? { ref: p.receiptRef, method: p.receiptMethod, date: p.receiptSettledAt }
      : null,
  };
}

function loadLivePurchases(where: Prisma.PurchaseInvoiceWhereInput = {}): Promise<PurchaseRow[]> {
  return prisma.purchaseInvoice.findMany({
    where: {
      eFacturaStatus: { in: [...PURCHASE_BALANCE_STATUSES] },
      supplierIdno: { not: null },
      totalAmount: { not: null },
      ...where,
    },
    select: PURCHASE_SELECT,
  });
}

/**
 * Card purchases (bank debits to the bank itself / without a fiscal code)
 * attributed to suppliers: alias > name > amount. `purchases` = the live
 * purchase invoices used for the amount match.
 */
export async function loadCardPurchases(
  purchases: readonly SettlementPurchase[],
  categories: SettlementInput["categories"],
): Promise<{ cards: CardPurchase[]; names: Map<string, string> }> {
  const bankIdnos = new Set<string>();
  const excluded = new Set<string>();
  for (const [idno, cat] of Object.entries(DEFAULT_COUNTERPARTY_CATEGORIES)) {
    if (cat === "bank") bankIdnos.add(idno);
    if (SERVICE_CATEGORIES.has(cat)) excluded.add(idno);
  }
  for (const [idno, c] of categories) {
    if (c.category === "bank") bankIdnos.add(idno);
    if (SERVICE_CATEGORIES.has(c.category)) excluded.add(idno);
    else excluded.delete(idno);
  }

  const [company, debits, aliases, supplierNames, payeeNames] = await Promise.all([
    getOrCreateCompanyProfile(),
    prisma.bankTransaction.findMany({
      where: {
        direction: "DEBIT",
        currency: "MDL",
        purpose: { not: null },
        OR: [{ counterpartyIdno: null }, { counterpartyIdno: { in: [...bankIdnos] } }],
      },
      select: { id: true, amount: true, bookingDate: true, purpose: true },
    }),
    prisma.cardMerchantAlias.findMany({ select: { merchantKey: true, idno: true } }),
    prisma.purchaseInvoice.findMany({
      where: { supplierIdno: { not: null }, supplierName: { not: null } },
      distinct: ["supplierIdno", "supplierName"],
      select: { supplierIdno: true, supplierName: true },
    }),
    prisma.bankTransaction.findMany({
      where: { direction: "DEBIT", counterpartyIdno: { not: null }, counterpartyName: { not: null } },
      distinct: ["counterpartyIdno", "counterpartyName"],
      select: { counterpartyIdno: true, counterpartyName: true },
    }),
  ]);
  if (company.fiscalCode) excluded.add(company.fiscalCode);

  const names = new Map<string, string>();
  const candidates: Array<{ idno: string; name: string }> = [];
  for (const r of supplierNames) {
    candidates.push({ idno: r.supplierIdno!, name: r.supplierName! });
    if (!names.has(r.supplierIdno!)) names.set(r.supplierIdno!, r.supplierName!.trim());
  }
  for (const r of payeeNames) {
    candidates.push({ idno: r.counterpartyIdno!, name: r.counterpartyName! });
    if (!names.has(r.counterpartyIdno!)) names.set(r.counterpartyIdno!, r.counterpartyName!.trim());
  }
  for (const [idno, c] of categories) {
    if (c.name?.trim()) {
      candidates.push({ idno, name: c.name });
      names.set(idno, c.name.trim());
    }
  }

  const cards = attributeCardPurchases({
    debits: debits.map((d) => ({ ...d, amount: num(d.amount) })),
    aliases,
    names: candidates,
    invoices: purchases.map((p) => ({
      supplierIdno: p.supplierIdno,
      totalAmount: p.totalAmount,
      issueDate: p.issueDate,
    })),
    excludedIdnos: excluded,
  });
  return { cards, names };
}

/** Counts / sums for «Оплаты картой» and merchants grouped by key. */
export function summarizeCardPurchases(
  cards: readonly CardPurchase[],
  nameOf: (idno: string) => string | null,
): CardPaymentsSummary {
  const c = (n: number) => Math.round(n * 100);
  const out = {
    attributedCount: 0,
    attributedSum: 0,
    unattributedCount: 0,
    unattributedSum: 0,
    ignoredCount: 0,
    ignoredSum: 0,
    byAmountCount: 0,
  };
  type G = CardMerchantGroup & { last: number; idnos: Set<string>; sources: Set<string> };
  const groups = new Map<string, G>();
  for (const p of cards) {
    const amount = c(p.amount);
    if (p.idno) {
      out.attributedCount += 1;
      out.attributedSum += amount;
      if (p.source === "amount") out.byAmountCount += 1;
    } else if (p.ignored) {
      out.ignoredCount += 1;
      out.ignoredSum += amount;
    } else {
      out.unattributedCount += 1;
      out.unattributedSum += amount;
    }
    let g = groups.get(p.merchantKey);
    if (!g) {
      g = {
        merchantKey: p.merchantKey,
        merchantRaw: p.merchantRaw,
        count: 0,
        sum: 0,
        lastDate: p.purchaseDate.toISOString(),
        attributedCount: 0,
        attributedSum: 0,
        idno: null,
        idnoName: null,
        source: null,
        last: 0,
        idnos: new Set(),
        sources: new Set(),
      };
      groups.set(p.merchantKey, g);
    }
    g.count += 1;
    g.sum += amount;
    if (p.purchaseDate.getTime() >= g.last) {
      g.last = p.purchaseDate.getTime();
      g.lastDate = p.purchaseDate.toISOString();
      g.merchantRaw = p.merchantRaw;
    }
    if (p.idno) {
      g.attributedCount += 1;
      g.attributedSum += amount;
      g.idnos.add(p.idno);
    }
    g.sources.add(p.ignored ? "ignored" : (p.source ?? "none"));
  }
  const merchants: CardMerchantGroup[] = [...groups.values()]
    .map(({ idnos, sources, ...rest }) => {
      const { last, ...g } = rest;
      void last;
      const idno = idnos.size === 1 ? [...idnos][0]! : null;
      let source: CardMerchantGroup["source"] = null;
      if (sources.has("ignored")) source = "ignored";
      else if (sources.has("alias")) source = "alias";
      else if (sources.has("name")) source = "name";
      else if (sources.has("amount")) source = sources.size === 1 ? "amount" : "mixed";
      return {
        ...g,
        sum: g.sum / 100,
        attributedSum: g.attributedSum / 100,
        idno,
        idnoName: idno ? nameOf(idno) : null,
        source,
      };
    })
    .sort((a, b) => b.sum - b.attributedSum - (a.sum - a.attributedSum) || b.sum - a.sum);
  return {
    attributedCount: out.attributedCount,
    attributedSum: out.attributedSum / 100,
    unattributedCount: out.unattributedCount,
    unattributedSum: out.unattributedSum / 100,
    ignoredCount: out.ignoredCount,
    ignoredSum: out.ignoredSum / 100,
    byAmountCount: out.byAmountCount,
    merchants,
  };
}

/** Bulk-loads both sides (a handful of queries, no per-party lookups). */
export async function computeSettlementsReport(): Promise<SettlementsResponse> {
  const [
    salesData,
    salesInvoices,
    credits,
    purchases,
    purchasesWithoutTotals,
    debits,
    categories,
    openingBalances,
  ] = await Promise.all([
      loadSalesBalanceData(),
      prisma.fiscalInvoice.findMany({
        where: {
          eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
          totalAmount: { not: null },
          buyerIdno: { not: null },
          AND: [excludeNonDeliveryWhere()],
        },
        select: { seria: true, number: true, buyerIdno: true, totalAmount: true, issueDate: true },
      }),
      prisma.bankTransaction.findMany({
        where: { direction: "CREDIT" },
        select: {
          id: true,
          amount: true,
          bookingDate: true,
          counterpartyIdno: true,
          matchStatus: true,
          documentNumber: true,
          allocations: {
            where: { fiscalInvoiceId: { not: null } },
            select: { fiscalInvoice: { select: { buyerIdno: true } } },
          },
        },
      }),
      loadLivePurchases(),
      prisma.purchaseInvoice.count({
        where: { eFacturaStatus: { in: [...PURCHASE_BALANCE_STATUSES] }, detailsFetchedAt: null },
      }),
      prisma.bankTransaction.findMany({
        where: { direction: "DEBIT", currency: "MDL", counterpartyIdno: { not: null } },
        select: {
          id: true,
          amount: true,
          bookingDate: true,
          counterpartyIdno: true,
          counterpartyName: true,
          txTypeCode: true,
          documentNumber: true,
        },
        orderBy: { bookingDate: "desc" },
      }),
      loadManualCategories(),
      loadOpeningBalances(),
    ]);

  const names = new Map(salesData.nameByIdno);
  for (const d of debits) {
    if (d.counterpartyIdno && d.counterpartyName?.trim() && !names.has(d.counterpartyIdno)) {
      names.set(d.counterpartyIdno, d.counterpartyName.trim());
    }
  }

  const settlementPurchases = purchases.map(toSettlementPurchase);
  const { cards, names: cardNames } = await loadCardPurchases(settlementPurchases, categories);
  for (const [idno, name] of cardNames) if (!names.has(idno)) names.set(idno, name);

  const result = computeSettlements({
    ownIdno: salesData.ownIdno,
    operationalIdnos: salesData.operationalSet,
    sales: salesData.balances,
    salesInvoices: salesInvoices.map((i) => ({
      buyerIdno: i.buyerIdno!,
      totalAmount: num(i.totalAmount),
      issueDate: i.issueDate,
      document: `${i.seria}${i.number}`,
    })),
    credits: credits.map((c) => ({
      id: c.id,
      amount: num(c.amount),
      bookingDate: c.bookingDate,
      counterpartyIdno: c.counterpartyIdno,
      matchStatus: c.matchStatus,
      documentNumber: c.documentNumber,
      allocatedBuyerIdnos: c.allocations.flatMap((a) =>
        a.fiscalInvoice?.buyerIdno ? [a.fiscalInvoice.buyerIdno] : [],
      ),
    })),
    purchases: settlementPurchases,
    debits: debits.map((d) => ({ ...d, amount: num(d.amount) })),
    cardPayments: cards.flatMap((c) =>
      c.idno
        ? [{ debitId: c.debitId, idno: c.idno, amount: c.amount, date: c.purchaseDate, merchant: c.merchantRaw }]
        : [],
    ),
    refundedByTx: refundedByTx(salesData.attribution.refunds),
    categories,
    names,
    purchasesWithoutTotals,
    openingBalances,
  });

  const rowName = new Map(result.rows.map((r) => [r.idno, r.name]));
  const cardPayments = summarizeCardPurchases(
    cards,
    (idno) => rowName.get(idno) ?? categories.get(idno)?.name ?? names.get(idno) ?? null,
  );

  return { ...result, cardPayments, generatedAt: new Date().toISOString() };
}

const STATEMENT_KIND: Record<string, LedgerEntryKind | null> = {
  invoice: "sale_invoice",
  payment: "payment_in",
  receipt: "receipt",
  historical_invoice: "historical_invoice",
  refund: "refund",
  // Paper FF synthetic debits are an act-only device; balances never include them.
  paper_invoice: null,
};

/**
 * One party's movements on both sides in date order with a running balance
 * (+ they owe us). Sales entries come from the reconciliation act.
 */
export async function loadSettlementLedger(
  idno: string,
  period: SettlementPeriod = { from: null, to: null },
): Promise<SettlementLedgerResponse> {
  const [statement, allPurchases, categories, debits, refunds, openingBalance, operational] = await Promise.all([
    computeClientStatement(idno),
    // All live purchases: the card amount match looks across suppliers.
    loadLivePurchases(),
    loadManualCategories(),
    prisma.bankTransaction.findMany({
      where: { direction: "DEBIT", currency: "MDL", counterpartyIdno: idno },
      select: {
        id: true,
        amount: true,
        bookingDate: true,
        counterpartyIdno: true,
        counterpartyName: true,
        txTypeCode: true,
        documentNumber: true,
        purpose: true,
      },
    }),
    // Only refunds on this party's own debits matter for the paid-to-them share.
    loadRefunds(prisma, idno),
    loadOpeningBalance(idno).catch(() => null),
    loadOperationalIdnos(),
  ]);

  const purchases = allPurchases.filter((p) => p.supplierIdno === idno);
  const { cards: allCards } = await loadCardPurchases(
    allPurchases.map(toSettlementPurchase),
    categories,
  );
  const cards = allCards.filter((c) => c.idno === idno);
  const cardIds = new Set(cards.map((c) => c.debitId));

  type Raw = Omit<LedgerEntry, "balance"> & { sort: number };
  const raw: Raw[] = [];
  const sortOf = (iso: string | null): number => (iso ? new Date(iso).getTime() : Number.MAX_SAFE_INTEGER);

  for (const e of statement?.entries ?? []) {
    const kind = STATEMENT_KIND[e.kind];
    if (!kind) continue;
    raw.push({
      kind,
      date: e.date,
      document: e.document,
      description: e.description,
      amount: Number(e.debit) - Number(e.credit),
      payerName: e.payerName ?? null,
      sort: sortOf(e.date) + (Number(e.credit) > 0 ? 1 : 0),
    });
  }

  for (const p of purchases) {
    const date = p.issueDate?.toISOString() ?? null;
    raw.push({
      kind: "purchase_invoice",
      date,
      document: `${p.seria}${p.number}`,
      description: null,
      amount: -num(p.totalAmount),
      sort: sortOf(date),
    });
  }

  const refunded = refundedByTx(refunds);
  for (const d of debits) {
    if (cardIds.has(d.id)) continue;
    const debit: SettlementDebit = { ...d, amount: num(d.amount) };
    const counted = supplierPaymentCents(debit, refunded);
    if (counted === 0) continue;
    const date = d.bookingDate.toISOString();
    raw.push({
      kind: "payment_out",
      date,
      document: d.documentNumber?.trim() || "—",
      description: d.purpose?.trim() || null,
      amount: counted / 100,
      sort: sortOf(date) + 1,
    });
  }

  for (const c of cards) {
    const date = c.purchaseDate.toISOString();
    raw.push({
      kind: "card_payment_out",
      date,
      document: c.merchantRaw,
      description: c.purpose?.trim() || null,
      amount: Math.round(c.amount * 100) / 100,
      cardSource: c.source,
      sort: sortOf(date) + 1,
    });
  }

  const receipts = receiptsNotCoveredByCard(
    purchases.flatMap((p) =>
      p.receiptSettledAt
        ? [
            {
              document: `${p.seria}${p.number}`,
              supplierIdno: idno,
              amount: num(p.totalAmount),
              date: p.receiptSettledAt,
              ref: p.receiptRef,
              method: p.receiptMethod,
            },
          ]
        : [],
    ),
    cards.map((c) => ({ debitId: c.debitId, idno, amount: c.amount, date: c.purchaseDate })),
  );
  for (const r of receipts) {
    const date = r.date.toISOString();
    raw.push({
      kind: "receipt_out",
      date,
      document: r.document,
      description: r.ref?.trim() || null,
      amount: r.amount,
      receiptMethod: r.method,
      sort: sortOf(date) + 1,
    });
  }

  const firstDocumentSort = raw.reduce((m, r) => Math.min(m, r.sort), Number.MAX_SAFE_INTEGER);
  if (openingBalance) {
    const date = new Date(`${openingBalance.asOfDate}T12:00:00.000Z`).toISOString();
    raw.push({
      kind: "opening_balance",
      date,
      document: "",
      description: openingBalance.note,
      amount: openingBalance.amount,
      // Before any same-day document.
      sort: sortOf(`${openingBalance.asOfDate}T00:00:00.000Z`) - 1,
    });
  }

  raw.sort((a, b) => a.sort - b.sort);

  const all: LedgerEntry[] = withRunningBalance(
    raw.map(({ sort, ...r }) => {
      void sort;
      return r;
    }),
  );
  const balance = all.length > 0 ? all[all.length - 1]!.balance : 0;
  const slice = sliceLedger(all, period);

  const name =
    (statement && statement.buyer.name !== "—" ? statement.buyer.name : null) ||
    purchases.find((p) => p.supplierName)?.supplierName ||
    debits.find((d) => d.counterpartyName)?.counterpartyName ||
    "—";

  const manual = categories.get(idno);
  const resolved = resolveCategory({
    idno,
    manual: manual?.category,
    hasPurchaseInvoices: purchases.length > 0,
    hasSalesInvoices: (statement?.entries ?? []).some((e) => e.kind === "invoice"),
    operational: operational.has(idno),
  });

  return {
    idno,
    name: manual?.name?.trim() || name,
    category: resolved.category,
    categorySource: resolved.source,
    entries: slice.entries,
    balance,
    period,
    opening: slice.opening,
    closing: slice.closing,
    totals: slice.totals,
    openingBalance,
    firstDocumentDate:
      firstDocumentSort < Number.MAX_SAFE_INTEGER ? new Date(firstDocumentSort).toISOString() : null,
  };
}
