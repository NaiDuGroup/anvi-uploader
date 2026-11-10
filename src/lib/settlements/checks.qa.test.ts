/**
 * QA (stage 3): «Проверить» signal keys and false positives.
 * «fixed:» tests failed on 42bd8e6 (defects found by QA) and pin the fix.
 */
import { describe, it, expect } from "vitest";
import { computeChecks, purchaseVatAnomaly, type CheckSupplier, type ChecksInput } from "./checks";
import type { SettlementRow } from "./types";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = day("2026-11-10");

function row(idno: string, extra: Partial<SettlementRow> = {}): SettlementRow {
  return {
    idno, name: `Party ${idno}`, category: "supplier", categorySource: "auto", autoCategory: "supplier", autoCategorySource: "auto", salesInvoiced: 0, receivedFromThem: 0,
    purchasesInvoiced: 0, paidToThem: 0, paidByCard: 0, paidByReceipt: 0, salesNet: 0, purchaseNet: 0, openingBalance: 0,
    balance: 0, state: "settled", flags: [], salesInvoiceCount: 0, purchaseInvoiceCount: 0, lastActivity: null, ...extra,
  };
}
const input = (extra: Partial<ChecksInput> = {}): ChecksInput => ({
  now: NOW, rows: [], suppliers: new Map(), matchingRan: true, cards: { unattributedCount: 0, unattributedSum: 0 },
  lowConfidenceSales: [], vatSales: [], vatPurchases: [], ...extra,
});
const sup = (s: Partial<CheckSupplier> & { idno: string }): Map<string, CheckSupplier> =>
  new Map([[s.idno, { payments: [], invoices: [], allocations: [], ...s }]]);

describe("QA signal keys", () => {
  it("keys are identical across reloads (regression)", () => {
    const suppliers = sup({
      idno: "5",
      payments: [{ id: "p1", amount: 100, date: day("2026-09-01"), kind: "bank", document: "11" }],
    });
    const a = computeChecks(input({ rows: [row("5")], suppliers }));
    const b = computeChecks(input({ rows: [row("5")], suppliers }));
    expect(a.map((s) => s.key)).toEqual(b.map((s) => s.key));
  });

  it("fixed: two suppliers with the same seria+number get different vat_anomaly keys (IDNO + invoice id)", () => {
    const vat = { total: 100, vat: 50, date: day("2026-10-01"), totalExVat: 50, linesVat: null };
    const s = computeChecks(input({ vatPurchases: [{ ...vat, document: "AA0000001", idno: "1" }, { ...vat, document: "AA0000001", idno: "2" }] }));
    const keys = s.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("fixed: card_unattributed key follows the merchant set, not the count / sum", () => {
    const k = (count: number, sum: number, merchantKeys: string[]) =>
      computeChecks(input({ cards: { unattributedCount: count, unattributedSum: sum, merchantKeys } }))[0]!.key;
    // Another purchase at a known merchant keeps «Проверено» …
    expect(k(3, 300, ["LINELLA", "NR1", "LINELLA"])).toBe(k(4, 350, ["NR1", "LINELLA", "LINELLA", "NR1"]));
    // … a new merchant brings it back.
    expect(k(3, 300, ["LINELLA", "NR1"])).not.toBe(k(4, 350, ["LINELLA", "NR1", "OMV"]));
  });

  it("fixed: monthly fee without invoices (StarNet-like) — a dismissed payment_unmatched stays dismissed next month", () => {
    const pays = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `p${i}`, amount: 250, date: day(`2026-0${i + 1}-05`), kind: "bank" as const, document: `${i}` }));
    const k = (n: number, now: string) =>
      computeChecks(input({ now: day(now), rows: [row("9")], suppliers: sup({ idno: "9", payments: pays(n) }) })).find((x) => x.type === "payment_unmatched")!.key;
    expect(k(8, "2026-09-10")).toBe(k(9, "2026-10-10"));
    expect(k(8, "2026-09-10")).toBe("payment_unmatched:9:p0");
  });
});

describe("QA low-confidence sales window", () => {
  it("only allocations from the last LOW_CONFIDENCE_MONTHS months; key = buyer + oldest allocation", () => {
    const sale = (id: string, date: string) => ({ allocationId: id, idno: "7", name: "C", amount: 10, date: day(date), confidence: 40, document: id });
    const k = (list: ReturnType<typeof sale>[]) =>
      computeChecks(input({ lowConfidenceSales: list })).filter((x) => x.type === "low_confidence_sales");
    const s = k([sale("old", "2024-01-05"), sale("a", "2026-01-05"), sale("b", "2026-10-05")]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ count: 2, key: "low_confidence_sales:7:a" });
    expect(k([sale("a", "2026-01-05"), sale("b", "2026-10-05"), sale("c", "2026-11-01")])[0]!.key).toBe("low_confidence_sales:7:a");
    expect(k([sale("old", "2024-01-05")])).toHaveLength(0);
  });
});

describe("QA stale links in signals", () => {
  it("stale confirmed links do not count as paid / linked", () => {
    const suppliers = sup({
      idno: "4",
      payments: [{ id: "p", amount: 100, date: day("2026-08-01"), kind: "bank", document: "PP1" }],
      invoices: [{ id: "i", document: "I1", total: 100, issueDate: day("2026-08-01"), paidOnSpot: false }],
      allocations: [{ id: "a", paymentId: "p", invoiceId: "i", amount: 100, status: "confirmed", staleReason: "payment_moved", invoiceDocument: "I1" }],
    });
    const s = computeChecks(input({ rows: [row("4", { state: "we_owe", purchaseNet: 100 })], suppliers }));
    expect(s.map((x) => x.type).sort()).toEqual(["payment_unmatched", "stale_link", "supplier_unpaid"]);
    expect(s.find((x) => x.type === "stale_link")).toMatchObject({ count: 1, amount: 100, documents: ["I1"] });
  });
});

describe("QA signal false positives", () => {
  it("fixed: a credit note (negative total + negative VAT) is not a «VAT anomaly»", () => {
    expect(purchaseVatAnomaly({ document: "EAR000470234", idno: "1018600014610", total: -855, vat: -142.5, totalExVat: -712.5, linesVat: -142.5, date: day("2026-10-01") })).toBeNull();
    // Mirrored rules still apply to credit notes; a positive VAT on a negative total is still flagged.
    expect(purchaseVatAnomaly({ document: "x", idno: "1", total: -120, vat: -50, totalExVat: -70, linesVat: null, date: null })).toBe("vat_over_rate");
    expect(purchaseVatAnomaly({ document: "x", idno: "1", total: -120, vat: 20, totalExVat: null, linesVat: null, date: null })).not.toBeNull();
  });

  it("negative invoice is never in «Не оплачено > 30 дней» (regression)", () => {
    const suppliers = sup({
      idno: "4",
      invoices: [{ id: "cn", document: "CN1", total: -500, issueDate: day("2026-08-01"), paidOnSpot: false }],
    });
    const s = computeChecks(input({ rows: [row("4", { state: "we_owe", purchaseNet: 100 })], suppliers }));
    expect(s.some((x) => x.type === "supplier_unpaid")).toBe(false);
  });

  it("fixed: an invoice offset by a credit note is not listed as unpaid", () => {
    const suppliers = sup({
      idno: "4",
      invoices: [
        { id: "i1", document: "I1", total: 1000, issueDate: day("2026-08-01"), paidOnSpot: false },
        { id: "cn", document: "CN", total: -1000, issueDate: day("2026-08-03"), paidOnSpot: false },
        { id: "i2", document: "I2", total: 300, issueDate: day("2026-08-10"), paidOnSpot: false },
      ],
    });
    const s = computeChecks(input({ rows: [row("4", { state: "we_owe", purchaseNet: 300 })], suppliers })).find((x) => x.type === "supplier_unpaid")!;
    expect(s.amount).toBe(300);
    expect(s.documents).toEqual(["I2"]); // I1 is fully offset by the storno
    expect(s.count).toBe(1);
  });
});
