/**
 * Settlements report + «Проверить» signals from one bulk load. The summary's
 * «Проверить» counter and the row filter use the undismissed signals, so the
 * list, the counter and the tab badge agree.
 */
import { prisma } from "@/lib/prisma";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { computeChecks, type LowConfidenceSale } from "./checks";
import { computeSettlementsReportFull } from "./load";
import { buildSupplierContexts, loadSupplierAllocations } from "./supplierMatchLoad";
import type { CheckSignal, SettlementChecks, SettlementsResponse } from "./types";

const num = (d: unknown): number | null => (d == null ? null : Number(d));

async function buildChecks(
  report: SettlementsResponse,
  internals: Awaited<ReturnType<typeof computeSettlementsReportFull>>["internals"],
): Promise<SettlementChecks> {
  const [allocations, dismissals, lowConf, lineVat, company] = await Promise.all([
    loadSupplierAllocations(),
    prisma.settlementCheckDismissal.findMany(),
    prisma.paymentAllocation.findMany({
      where: { matchedBy: "AUTO", confidence: { lt: 60 }, fiscalInvoiceId: { not: null } },
      select: {
        id: true,
        amount: true,
        confidence: true,
        bankTransaction: { select: { bookingDate: true, counterpartyIdno: true, counterpartyName: true } },
        fiscalInvoice: { select: { seria: true, number: true, buyerIdno: true, buyerName: true } },
      },
    }),
    prisma.purchaseInvoiceLine.groupBy({
      by: ["invoiceId"],
      _sum: { vatAmount: true },
      _count: { _all: true, vatAmount: true },
    }),
    getOrCreateCompanyProfile(),
  ]);

  const ctxs = buildSupplierContexts(
    {
      purchases: internals.purchases,
      debits: internals.debits,
      cards: internals.cards,
      refundedByTx: internals.refundedByTx,
      categories: internals.categories,
      ownIdno: company.fiscalCode || null,
    },
    allocations,
  );

  const linesVat = new Map(
    lineVat
      .filter((g) => g._count._all > 0 && g._count.vatAmount === g._count._all)
      .map((g) => [g.invoiceId, Number(g._sum.vatAmount ?? 0)]),
  );

  const lowConfidenceSales: LowConfidenceSale[] = lowConf.flatMap((a) => {
    const idno = a.fiscalInvoice?.buyerIdno ?? a.bankTransaction.counterpartyIdno;
    if (!idno || a.confidence == null) return [];
    return [
      {
        allocationId: a.id,
        idno,
        name: a.fiscalInvoice?.buyerName ?? a.bankTransaction.counterpartyName ?? null,
        amount: Number(a.amount),
        date: a.bankTransaction.bookingDate,
        confidence: a.confidence,
        document: a.fiscalInvoice ? `${a.fiscalInvoice.seria}${a.fiscalInvoice.number}` : "—",
      },
    ];
  });

  const signals: CheckSignal[] = computeChecks({
    now: new Date(),
    rows: report.rows,
    suppliers: ctxs,
    matchingRan: allocations.length > 0,
    cards: report.cardPayments,
    lowConfidenceSales,
    vatSales: internals.salesInvoices.map((i) => ({
      document: `${i.seria}${i.number}`,
      idno: i.buyerIdno,
      total: Number(i.totalAmount ?? 0),
      vat: num(i.vatAmount),
      date: i.issueDate,
    })),
    vatPurchases: internals.purchases.map((p) => ({
      document: `${p.seria}${p.number}`,
      idno: p.supplierIdno,
      total: Number(p.totalAmount ?? 0),
      vat: num(p.vatAmount),
      totalExVat: num(p.totalExVat),
      linesVat: linesVat.get(p.id) ?? null,
      date: p.issueDate,
    })),
    names: internals.names,
  });

  const byKey = new Map(dismissals.map((d) => [d.signalKey, d]));
  for (const s of signals) {
    const d = byKey.get(s.key);
    s.dismissal = d ? { note: d.note, by: d.dismissedByName, at: d.createdAt.toISOString() } : null;
  }
  return {
    signals,
    activeCount: signals.filter((s) => !s.dismissal).length,
    matchingRan: allocations.length > 0,
  };
}

export async function loadSettlementsWithChecks(): Promise<SettlementsResponse> {
  const { report, internals } = await computeSettlementsReportFull();
  try {
    const checks = await buildChecks(report, internals);
    report.checks = checks;
    report.summary.checkCount = checks.activeCount;
  } catch (error) {
    console.error("settlements: checks not built:", error);
    report.checks = null;
  }
  return report;
}
