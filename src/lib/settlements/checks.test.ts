import { describe, it, expect } from "vitest";
import {
  computeChecks,
  purchaseVatAnomaly,
  salesVatAnomaly,
  stableHash,
  type CheckSupplier,
  type ChecksInput,
} from "./checks";
import type { SettlementRow } from "./types";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = day("2026-11-10");

function row(idno: string, extra: Partial<SettlementRow> = {}): SettlementRow {
  return {
    idno,
    name: `Party ${idno}`,
    category: "supplier",
    categorySource: "auto",
    salesInvoiced: 0,
    receivedFromThem: 0,
    purchasesInvoiced: 0,
    paidToThem: 0,
    paidByCard: 0,
    paidByReceipt: 0,
    salesNet: 0,
    purchaseNet: 0,
    openingBalance: 0,
    balance: 0,
    state: "settled",
    flags: [],
    salesInvoiceCount: 0,
    purchaseInvoiceCount: 0,
    lastActivity: null,
    ...extra,
  };
}

function input(extra: Partial<ChecksInput> = {}): ChecksInput {
  return {
    now: NOW,
    rows: [],
    suppliers: new Map(),
    matchingRan: true,
    cards: { unattributedCount: 0, unattributedSum: 0 },
    lowConfidenceSales: [],
    vatSales: [],
    vatPurchases: [],
    ...extra,
  };
}

const sup = (s: Partial<CheckSupplier> & { idno: string }): Map<string, CheckSupplier> =>
  new Map([[s.idno, { payments: [], invoices: [], allocations: [], ...s }]]);

describe("stableHash", () => {
  it("ignores order and changes with content", () => {
    expect(stableHash(["a", "b"])).toBe(stableHash(["b", "a"]));
    expect(stableHash(["a", "b"])).not.toBe(stableHash(["a", "c"]));
  });
});

describe("computeChecks", () => {
  it("turns balance flags into signals with stable keys", () => {
    const rows = [
      row("1", {
        state: "they_owe",
        flags: [{ kind: "duplicate_sale", amount: 100, dates: ["2026-10-01T00:00:00.000Z", "2026-10-05T00:00:00.000Z"], documents: ["EBJ2", "EBJ1"] }],
      }),
      row("2", { state: "we_overpaid", flags: [{ kind: "supplier_overpaid", amount: 50, dates: [], documents: [] }] }),
    ];
    const a = computeChecks(input({ rows }));
    const b = computeChecks(input({ rows }));
    expect(a.map((s) => s.key)).toEqual(b.map((s) => s.key));
    expect(a.find((s) => s.type === "duplicate_sale")?.key).toBe("duplicate_sale:1:EBJ1,EBJ2");
    expect(a.find((s) => s.type === "supplier_overpaid")?.key).toBe("supplier_overpaid:2:50.00");
  });

  it("duplicate payment within 7 days, skipped for «Прочее»", () => {
    const suppliers = sup({
      idno: "3",
      payments: [
        { id: "p1", amount: 500, date: day("2026-10-01"), kind: "bank", document: "1" },
        { id: "p2", amount: 500, date: day("2026-10-05"), kind: "bank", document: "2" },
        { id: "p3", amount: 500, date: day("2026-11-01"), kind: "bank", document: "3" },
      ],
      invoices: [{ id: "i1", document: "EBF1", total: 500, issueDate: day("2026-09-30"), paidOnSpot: false }],
    });
    const s = computeChecks(input({ rows: [row("3")], suppliers }));
    const dup = s.filter((x) => x.type === "duplicate_payment");
    expect(dup).toHaveLength(1);
    expect(dup[0]!.key).toBe("duplicate_payment:3:p1,p2");
    expect(computeChecks(input({ rows: [row("3", { category: "other" })], suppliers })).some((x) => x.type === "duplicate_payment")).toBe(false);
  });

  it("unpaid supplier invoices only after matching and while we owe", () => {
    const suppliers = sup({
      idno: "4",
      invoices: [
        { id: "i1", document: "EBF1", total: 300, issueDate: day("2026-08-01"), paidOnSpot: false },
        { id: "i2", document: "EBF2", total: 200, issueDate: day("2026-11-05"), paidOnSpot: false },
        { id: "i3", document: "EBF3", total: 100, issueDate: day("2026-07-01"), paidOnSpot: true },
      ],
    });
    const owe = row("4", { state: "we_owe", purchaseNet: 500, balance: -500 });
    const s = computeChecks(input({ rows: [owe], suppliers })).find((x) => x.type === "supplier_unpaid");
    expect(s).toMatchObject({ amount: 300, count: 1, documents: ["EBF1"] });
    expect(s!.ageDays).toBe(101);
    expect(computeChecks(input({ rows: [owe], suppliers, matchingRan: false })).some((x) => x.type === "supplier_unpaid")).toBe(false);
    expect(computeChecks(input({ rows: [row("4", { state: "settled" })], suppliers })).some((x) => x.type === "supplier_unpaid")).toBe(false);
  });

  it("payment without any link after 30 days", () => {
    const suppliers = sup({
      idno: "5",
      payments: [
        { id: "p1", amount: 100, date: day("2026-09-01"), kind: "bank", document: "11" },
        { id: "p2", amount: 100, date: day("2026-11-01"), kind: "bank", document: "12" },
        { id: "p3", amount: 70, date: day("2026-08-01"), kind: "card", document: "SHOP" },
      ],
      allocations: [{ paymentId: "p3", invoiceId: "i1", amount: 70, status: "suggested" }],
    });
    const s = computeChecks(input({ rows: [row("5")], suppliers })).find((x) => x.type === "payment_unmatched");
    expect(s).toMatchObject({ amount: 100, count: 1, documents: ["11"] });
  });

  it("B/f invoice also paid by bank transfer", () => {
    const suppliers = sup({
      idno: "6",
      payments: [{ id: "p1", amount: 250, date: day("2026-10-03"), kind: "bank", document: "77" }],
      invoices: [{ id: "i1", document: "EBF9", total: 250, issueDate: day("2026-10-01"), paidOnSpot: true }],
    });
    const s = computeChecks(input({ rows: [row("6")], suppliers })).filter((x) => x.type === "receipt_and_bank");
    expect(s).toHaveLength(1);
    expect(s[0]!.key).toBe("receipt_and_bank:i1:p1");
  });

  it("B/f signal skips a transfer confirmed against another invoice", () => {
    const suppliers = sup({
      idno: "6",
      payments: [{ id: "p1", amount: 250, date: day("2026-10-03"), kind: "bank", document: "77" }],
      invoices: [
        { id: "i1", document: "EBF9", total: 250, issueDate: day("2026-10-01"), paidOnSpot: true },
        { id: "i2", document: "EBF10", total: 250, issueDate: day("2026-10-02"), paidOnSpot: false },
      ],
      allocations: [{ paymentId: "p1", invoiceId: "i2", amount: 250, status: "confirmed" }],
    });
    expect(computeChecks(input({ rows: [row("6")], suppliers })).some((x) => x.type === "receipt_and_bank")).toBe(false);
  });

  it("card, low-confidence sales and VAT signals", () => {
    const s = computeChecks(
      input({
        cards: { unattributedCount: 3, unattributedSum: 120.5 },
        lowConfidenceSales: [
          { allocationId: "a1", idno: "7", name: "C", amount: 10, date: day("2026-10-01"), confidence: 40, document: "EBJ1" },
          { allocationId: "a2", idno: "7", name: "C", amount: 20, date: day("2026-10-02"), confidence: 50, document: "EBJ2" },
          { allocationId: "a3", idno: "7", name: "C", amount: 20, date: day("2026-10-02"), confidence: 82, document: "EBJ3" },
        ],
        vatSales: [{ document: "EBJ5", idno: "7", total: 120, vat: 30, date: day("2026-10-01") }],
        vatPurchases: [{ document: "EBF5", idno: "8", total: 120, vat: 20, totalExVat: 90, linesVat: null, date: null }],
      }),
    );
    expect(s.find((x) => x.type === "card_unattributed")?.key).toBe("card_unattributed:3:120.50");
    expect(s.find((x) => x.type === "low_confidence_sales")).toMatchObject({ amount: 30, count: 2, confidence: 40 });
    expect(s.filter((x) => x.type === "vat_anomaly").map((x) => x.vatReason)).toEqual(["vat_over_rate", "sum_mismatch"]);
  });
});

describe("VAT anomaly rules", () => {
  it("sales", () => {
    expect(salesVatAnomaly({ document: "x", idno: null, total: 120, vat: 20, date: null })).toBeNull();
    expect(salesVatAnomaly({ document: "x", idno: null, total: 120, vat: 130, date: null })).toBe("vat_over_total");
    expect(salesVatAnomaly({ document: "x", idno: null, total: 120, vat: -1, date: null })).toBe("vat_negative");
  });
  it("purchases", () => {
    const base = { document: "x", idno: null, total: 120, vat: 20, date: null };
    expect(purchaseVatAnomaly({ ...base, totalExVat: 100, linesVat: 20 })).toBeNull();
    expect(purchaseVatAnomaly({ ...base, totalExVat: 100, linesVat: 25 })).toBe("lines_mismatch");
  });
});
