import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STATEMENT_EFACTURA_STATUSES } from "@/lib/reconciliation/autoMatch";
import { loadRefunds } from "@/lib/reconciliation/credits";
import { excludeNonDeliveryWhere } from "@/lib/reconciliation/fiscalFlags";
import { computeClientStatement, loadSalesBalanceData } from "@/lib/reconciliation/report";
import { ISSUED_EFACTURA_STATUSES } from "@/lib/efactura/types";
import {
  computeSettlements,
  supplierPaymentCents,
  type SettlementDebit,
  type SettlementInput,
} from "./balance";
import {
  isCounterpartyCategory,
  type CounterpartyCategoryCode,
  type LedgerEntry,
  type LedgerEntryKind,
  type SettlementLedgerResponse,
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

/** Bulk-loads both sides (a handful of queries, no per-party lookups). */
export async function computeSettlementsReport(): Promise<SettlementsResponse> {
  const [salesData, salesInvoices, credits, purchases, purchasesWithoutTotals, debits, categories] =
    await Promise.all([
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
      prisma.purchaseInvoice.findMany({
        where: {
          eFacturaStatus: { in: [...PURCHASE_BALANCE_STATUSES] },
          supplierIdno: { not: null },
          totalAmount: { not: null },
        },
        select: {
          seria: true,
          number: true,
          supplierIdno: true,
          supplierName: true,
          totalAmount: true,
          issueDate: true,
        },
      }),
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
    ]);

  const names = new Map(salesData.nameByIdno);
  for (const d of debits) {
    if (d.counterpartyIdno && d.counterpartyName?.trim() && !names.has(d.counterpartyIdno)) {
      names.set(d.counterpartyIdno, d.counterpartyName.trim());
    }
  }

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
    purchases: purchases.map((p) => ({
      supplierIdno: p.supplierIdno!,
      supplierName: p.supplierName,
      totalAmount: num(p.totalAmount),
      issueDate: p.issueDate,
      document: `${p.seria}${p.number}`,
    })),
    debits: debits.map((d) => ({ ...d, amount: num(d.amount) })),
    refundedByTx: refundedByTx(salesData.attribution.refunds),
    categories,
    names,
    purchasesWithoutTotals,
  });

  return { ...result, generatedAt: new Date().toISOString() };
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
export async function loadSettlementLedger(idno: string): Promise<SettlementLedgerResponse | null> {
  const [statement, purchases, debits, refunds] = await Promise.all([
    computeClientStatement(idno),
    prisma.purchaseInvoice.findMany({
      where: {
        supplierIdno: idno,
        eFacturaStatus: { in: [...PURCHASE_BALANCE_STATUSES] },
        totalAmount: { not: null },
      },
      select: { seria: true, number: true, issueDate: true, totalAmount: true, supplierName: true },
    }),
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
  ]);

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

  if (raw.length === 0) return null;
  raw.sort((a, b) => a.sort - b.sort);

  let running = 0;
  const entries: LedgerEntry[] = raw.map((r) => {
    running = Math.round((running + r.amount) * 100) / 100;
    return {
      kind: r.kind,
      date: r.date,
      document: r.document,
      description: r.description,
      amount: r.amount,
      payerName: r.payerName,
      balance: running,
    };
  });

  const name =
    (statement && statement.buyer.name !== "—" ? statement.buyer.name : null) ||
    purchases.find((p) => p.supplierName)?.supplierName ||
    debits.find((d) => d.counterpartyName)?.counterpartyName ||
    "—";

  return { idno, name, entries, balance: running };
}
