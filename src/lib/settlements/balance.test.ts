import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { attributeCredits, type RefundEntry } from "@/lib/reconciliation/credits";
import {
  buildBalanceReport,
  computeSalesBalances,
  type SalesBalanceInvoice,
} from "@/lib/reconciliation/report";
import {
  computeSettlements,
  type SettlementCredit,
  type SettlementDebit,
  type SettlementInput,
  type SettlementPurchase,
} from "./balance";
import type { CounterpartyCategoryCode, SettlementRow } from "./types";

const d = (v: number | string) => new Prisma.Decimal(v);
const day = (s: string) => new Date(`${s}T10:00:00.000Z`);

const OWN = "1023600000396";
const CLIENT = "1010600000001";
const SUPPLIER = "1004600016671";
const PAYER = "1017604005798";

type Inv = { buyer: string; total: number; date: string; doc: string; name?: string };
type Credit = {
  id: string;
  payer: string;
  amount: number;
  date: string;
  allocations?: Array<{ buyer: string; amount: number }>;
  status?: string;
};
type Debit = { id: string; to: string; amount: number; date: string; td?: string; name?: string };

function scenario(opts: {
  invoices?: Inv[];
  credits?: Credit[];
  purchases?: Array<{ supplier: string; total: number; date: string; doc: string }>;
  debits?: Debit[];
  /** Refunds: debit id → owner buyer + amount. */
  refunds?: Array<{ debitId: string; owner: string; amount: number }>;
  categories?: Record<string, CounterpartyCategoryCode>;
  operational?: string[];
}) {
  const invoices: SalesBalanceInvoice[] = (opts.invoices ?? []).map((i) => ({
    totalAmount: d(i.total),
    issueDate: day(i.date),
    buyerIdno: i.buyer,
    buyerName: i.name ?? `Firm ${i.buyer}`,
    clientId: null,
    receiptSettledAt: null,
    redirections: null,
  }));
  const credits = opts.credits ?? [];
  const debits = opts.debits ?? [];
  const refunds: RefundEntry[] = (opts.refunds ?? []).map((r) => {
    const tx = debits.find((x) => x.id === r.debitId)!;
    return {
      ownerIdno: r.owner,
      amount: d(r.amount),
      transaction: {
        id: tx.id,
        bookingDate: day(tx.date),
        amount: d(tx.amount),
        documentNumber: null,
        purpose: null,
        counterpartyIdno: tx.to,
        counterpartyName: null,
      },
    };
  });
  const attribution = attributeCredits(
    credits.map((c) => ({
      id: c.id,
      amount: d(c.amount),
      counterpartyIdno: c.payer,
      matchStatus: c.status ?? "MATCHED",
    })),
    credits.flatMap((c) =>
      (c.allocations ?? []).map((a) => ({
        bankTransactionId: c.id,
        amount: d(a.amount),
        bankTransaction: { direction: "CREDIT" },
        fiscalInvoice: { buyerIdno: a.buyer },
      })),
    ),
    refunds,
  );
  const sales = computeSalesBalances(invoices, attribution, new Map());
  const operationalIdnos = new Set(opts.operational ?? []);

  const refundedByTx = new Map<string, number>();
  for (const r of refunds) {
    refundedByTx.set(r.transaction.id, (refundedByTx.get(r.transaction.id) ?? 0) + Number(r.amount));
  }

  const input: SettlementInput = {
    ownIdno: OWN,
    operationalIdnos,
    sales,
    salesInvoices: (opts.invoices ?? []).map((i) => ({
      buyerIdno: i.buyer,
      totalAmount: i.total,
      issueDate: day(i.date),
      document: i.doc,
    })),
    credits: credits.map(
      (c): SettlementCredit => ({
        id: c.id,
        amount: c.amount,
        bookingDate: day(c.date),
        counterpartyIdno: c.payer,
        matchStatus: c.status ?? "MATCHED",
        allocatedBuyerIdnos: (c.allocations ?? []).map((a) => a.buyer),
        documentNumber: c.id,
      }),
    ),
    purchases: (opts.purchases ?? []).map(
      (p): SettlementPurchase => ({
        supplierIdno: p.supplier,
        supplierName: `Supplier ${p.supplier}`,
        totalAmount: p.total,
        issueDate: day(p.date),
        document: p.doc,
      }),
    ),
    debits: debits.map(
      (x): SettlementDebit => ({
        id: x.id,
        amount: x.amount,
        bookingDate: day(x.date),
        counterpartyIdno: x.to,
        counterpartyName: x.name ?? null,
        txTypeCode: x.td ?? "1",
        documentNumber: x.id,
      }),
    ),
    refundedByTx,
    categories: new Map(
      Object.entries(opts.categories ?? {}).map(([idno, category]) => [idno, { category, name: null }]),
    ),
  };
  const result = computeSettlements(input);
  const row = (idno: string): SettlementRow | undefined => result.rows.find((r) => r.idno === idno);
  return { result, row, sales, operationalIdnos };
}

describe("computeSettlements", () => {
  it("sales only: open invoice makes a debtor", () => {
    const { row, result } = scenario({
      invoices: [
        { buyer: CLIENT, total: 1000, date: "2026-03-01", doc: "EAA1" },
        { buyer: CLIENT, total: 500, date: "2026-04-01", doc: "EAA2" },
      ],
      credits: [{ id: "c1", payer: CLIENT, amount: 1000, date: "2026-03-10" }],
    });
    const r = row(CLIENT)!;
    expect(r).toMatchObject({
      salesInvoiced: 1500,
      receivedFromThem: 1000,
      purchasesInvoiced: 0,
      paidToThem: 0,
      balance: 500,
      state: "they_owe",
      category: "customer",
      categorySource: "auto",
    });
    expect(result.summary.theyOwe).toBe(500);
  });

  it("supplier only: unpaid purchase invoice means we owe", () => {
    const { row, result } = scenario({
      purchases: [
        { supplier: SUPPLIER, total: 3000, date: "2026-05-01", doc: "SUP1" },
        { supplier: SUPPLIER, total: 2000, date: "2026-06-01", doc: "SUP2" },
      ],
      debits: [{ id: "d1", to: SUPPLIER, amount: 3000, date: "2026-05-05" }],
    });
    expect(row(SUPPLIER)).toMatchObject({
      purchasesInvoiced: 5000,
      paidToThem: 3000,
      purchaseNet: 2000,
      balance: -2000,
      state: "we_owe",
      category: "supplier",
    });
    expect(result.summary.weOwe).toBe(2000);
    expect(result.summary.checkCount).toBe(0);
  });

  it("both sides net into one signed balance", () => {
    // We sold them 10 000 (paid 4 000), they sold us 7 000 (we paid 5 000).
    const { row } = scenario({
      invoices: [{ buyer: SUPPLIER, total: 10000, date: "2026-02-01", doc: "EAA9" }],
      credits: [{ id: "c1", payer: SUPPLIER, amount: 4000, date: "2026-02-10" }],
      purchases: [{ supplier: SUPPLIER, total: 7000, date: "2026-02-15", doc: "SUP9" }],
      debits: [{ id: "d1", to: SUPPLIER, amount: 5000, date: "2026-02-20" }],
    });
    expect(row(SUPPLIER)).toMatchObject({
      salesNet: 6000,
      purchaseNet: 2000,
      balance: 4000,
      state: "they_owe",
    });
  });

  it("third-party payer: allocated money settles the buyer, not the payer", () => {
    const { row } = scenario({
      invoices: [{ buyer: CLIENT, total: 5338, date: "2026-01-10", doc: "EAA5338" }],
      credits: [
        {
          id: "c1",
          payer: PAYER,
          amount: 5338,
          date: "2026-01-20",
          allocations: [{ buyer: CLIENT, amount: 5338 }],
        },
      ],
    });
    expect(row(CLIENT)).toMatchObject({ receivedFromThem: 5338, balance: 0, state: "settled" });
    expect(row(PAYER)).toBeUndefined();
  });

  it("refund to a client is not counted as a supplier payment", () => {
    const { row } = scenario({
      invoices: [{ buyer: CLIENT, total: 1000, date: "2026-03-01", doc: "EAA1" }],
      credits: [{ id: "c1", payer: CLIENT, amount: 1500, date: "2026-03-05" }],
      debits: [{ id: "d1", to: CLIENT, amount: 500, date: "2026-03-20" }],
      refunds: [{ debitId: "d1", owner: CLIENT, amount: 500 }],
    });
    expect(row(CLIENT)).toMatchObject({
      receivedFromThem: 1000,
      paidToThem: 0,
      balance: 0,
      state: "settled",
    });
  });

  it("supplier overpaid: flagged and shown as our overpayment", () => {
    const { row, result } = scenario({
      purchases: [{ supplier: SUPPLIER, total: 800, date: "2026-07-01", doc: "SUP1" }],
      debits: [{ id: "d1", to: SUPPLIER, amount: 1000, date: "2026-07-02" }],
    });
    const r = row(SUPPLIER)!;
    expect(r).toMatchObject({ purchaseNet: -200, balance: 200, state: "we_overpaid" });
    expect(r.flags.map((f) => f.kind)).toContain("supplier_overpaid");
    expect(result.summary.weOverpaid).toBe(200);
    expect(result.summary.theyOwe).toBe(0);
  });

  it("client overpaid is told apart from a supplier debt", () => {
    const { row, result } = scenario({
      invoices: [{ buyer: CLIENT, total: 1000, date: "2026-03-01", doc: "EAA1" }],
      credits: [{ id: "c1", payer: CLIENT, amount: 1200, date: "2026-03-02" }],
    });
    expect(row(CLIENT)).toMatchObject({ balance: -200, state: "they_overpaid" });
    expect(result.summary.theyOverpaid).toBe(200);
    expect(result.summary.weOwe).toBe(0);
  });

  it("service categories and own IDNO stay out of balances; fees are not payments", () => {
    const TREASURY = "1006601000037";
    const MAIB = "1002600003778";
    const { row, result } = scenario({
      debits: [
        { id: "t1", to: TREASURY, amount: 40000, date: "2026-04-25" },
        { id: "o1", to: OWN, amount: 10000, date: "2026-04-26" },
        { id: "f1", to: MAIB, amount: 15, date: "2026-04-26", td: "6" },
        { id: "m1", to: MAIB, amount: 300, date: "2026-04-26" },
        { id: "s1", to: SUPPLIER, amount: 99, date: "2026-04-26", td: "6" },
      ],
    });
    expect(row(OWN)).toBeUndefined();
    expect(row(TREASURY)).toMatchObject({ state: "service", category: "tax", categorySource: "default" });
    expect(row(MAIB)).toMatchObject({ state: "service", paidToThem: 300 });
    // A TD=6 row is never a payment, so the supplier has nothing at all.
    expect(row(SUPPLIER)).toBeUndefined();
    expect(result.summary).toMatchObject({ weOverpaid: 0, theyOwe: 0, serviceCount: 2 });
  });

  it("unknown IDNO without invoices goes to «Не размечено» until classified", () => {
    const PERSON = "0971903893715";
    const base = { debits: [{ id: "d1", to: PERSON, amount: 2500, date: "2026-05-01" }] };
    const before = scenario(base);
    expect(before.row(PERSON)).toMatchObject({ state: "unclassified", category: null });
    expect(before.result.summary.unclassifiedCount).toBe(1);
    expect(before.result.summary.weOverpaid).toBe(0);

    const asStaff = scenario({ ...base, categories: { [PERSON]: "staff" } });
    expect(asStaff.row(PERSON)).toMatchObject({ state: "service", categorySource: "manual" });

    const asSupplier = scenario({ ...base, categories: { [PERSON]: "supplier" } });
    expect(asSupplier.row(PERSON)).toMatchObject({ state: "we_overpaid", balance: 2500 });
  });

  it("flags two equal sales invoices within 90 days paid only once", () => {
    const DUNCAS = "1018600000777";
    const { row } = scenario({
      invoices: [
        { buyer: DUNCAS, total: 12500, date: "2026-06-19", doc: "EBJ000372665" },
        { buyer: DUNCAS, total: 12500, date: "2026-08-12", doc: "EBL000162700" },
      ],
      credits: [{ id: "c1", payer: DUNCAS, amount: 12500, date: "2026-06-25" }],
    });
    const r = row(DUNCAS)!;
    expect(r.balance).toBe(12500);
    expect(r.flags).toEqual([
      expect.objectContaining({
        kind: "duplicate_sale",
        amount: 12500,
        documents: ["EBJ000372665", "EBL000162700"],
      }),
    ]);
  });

  it("does not flag equal invoices that were each paid", () => {
    const { row } = scenario({
      invoices: [
        { buyer: CLIENT, total: 12500, date: "2026-06-19", doc: "A1" },
        { buyer: CLIENT, total: 12500, date: "2026-08-12", doc: "A2" },
        { buyer: CLIENT, total: 100, date: "2026-09-01", doc: "A3" },
      ],
      credits: [
        { id: "c1", payer: CLIENT, amount: 12500, date: "2026-06-25" },
        { id: "c2", payer: CLIENT, amount: 12500, date: "2026-08-20" },
      ],
    });
    expect(row(CLIENT)!.flags).toEqual([]);
  });

  it("flags a payment with no invoice nearby while the client is in credit", () => {
    const { row } = scenario({
      invoices: [{ buyer: CLIENT, total: 1000, date: "2026-01-10", doc: "A1" }],
      credits: [
        { id: "c1", payer: CLIENT, amount: 1000, date: "2026-01-15" },
        { id: "c2", payer: CLIENT, amount: 700, date: "2026-06-01" },
      ],
    });
    const flags = row(CLIENT)!.flags;
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: "payment_without_invoice", amount: 700, documents: ["c2"] });
  });

  it("flags the same amount paid to a supplier twice with one invoice", () => {
    const { row } = scenario({
      purchases: [{ supplier: SUPPLIER, total: 4200, date: "2026-03-01", doc: "SUP1" }],
      debits: [
        { id: "d1", to: SUPPLIER, amount: 4200, date: "2026-03-03" },
        { id: "d2", to: SUPPLIER, amount: 4200, date: "2026-03-20" },
      ],
    });
    const kinds = row(SUPPLIER)!.flags.map((f) => f.kind).sort();
    expect(kinds).toEqual(["duplicate_payment", "supplier_overpaid"]);
  });

  it("sales side equals the «Должники» report for every client", () => {
    const { result, sales, operationalIdnos } = scenario({
      invoices: [
        { buyer: CLIENT, total: 1500, date: "2026-03-01", doc: "A1" },
        { buyer: SUPPLIER, total: 900, date: "2026-03-02", doc: "A2" },
        { buyer: PAYER, total: 100, date: "2026-03-03", doc: "A3" },
      ],
      credits: [
        { id: "c1", payer: CLIENT, amount: 400, date: "2026-03-05" },
        { id: "c2", payer: PAYER, amount: 600, date: "2026-03-06", allocations: [{ buyer: SUPPLIER, amount: 500 }] },
        { id: "c3", payer: "1003600099999", amount: 250, date: "2026-03-07" },
        { id: "c4", payer: "1002600003778", amount: 9999, date: "2026-03-08", status: "IGNORED" },
      ],
      purchases: [{ supplier: SUPPLIER, total: 300, date: "2026-03-04", doc: "S1" }],
      operational: ["1002600003778"],
    });
    const report = buildBalanceReport(
      { balances: sales, ownIdno: OWN, operationalSet: new Set(operationalIdnos), dbExclusions: [] },
      day("2026-11-10").getTime(),
    );
    const salesNetByIdno = new Map(result.rows.map((r) => [r.idno, r.salesNet]));
    for (const debtor of report.debtors) {
      expect(salesNetByIdno.get(debtor.buyerIdno)).toBe(Number(debtor.amount));
    }
    for (const creditor of report.creditors) {
      expect(salesNetByIdno.get(creditor.buyerIdno)).toBe(-Number(creditor.amount));
    }
    expect(report.debtors.map((r) => r.buyerIdno).sort()).toEqual([CLIENT, SUPPLIER].sort());
    expect(report.creditors.map((r) => r.buyerIdno)).toEqual(["1003600099999"]);
    // The payer kept 100 after lending 500 to SUPPLIER's invoice: exactly its own 100.
    expect(salesNetByIdno.get(PAYER)).toBe(0);
    expect(report.operational.map((r) => r.buyerIdno)).toEqual(["1002600003778"]);
  });
});
