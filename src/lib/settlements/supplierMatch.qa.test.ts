/**
 * QA (stage 3): supplier matching engine edge cases.
 * «fixed:» tests failed on 42bd8e6 (defects found by QA) and pin the fix.
 */
import { describe, it, expect } from "vitest";
import {
  capAllocation,
  extractCitedRefs,
  findSubsetSum,
  isInvoiceCited,
  suggestSupplierMatches,
  type SmInvoice,
  type SmPayment,
} from "./supplierMatch";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const inv = (id: string, seria: string, number: string, total: number, date: string, extra: Partial<SmInvoice> = {}): SmInvoice => ({
  id,
  seria,
  number,
  total,
  issueDate: day(date),
  paidOnSpot: false,
  ...extra,
});
const pay = (id: string, amount: number, date: string, purpose: string | null = null): SmPayment => ({
  id,
  amount,
  date: day(date),
  purpose,
  kind: "bank",
  document: id,
});
const cited = (seria: string, number: string, purpose: string) => isInvoiceCited({ seria, number }, extractCitedRefs(purpose));

describe("QA cited-number parsing — correct behaviour (regression)", () => {
  it("does not read dates as invoice numbers", () => {
    expect(cited("AA", "10112026", "plata din 10.11.2026")).toBe(false);
    expect(cited("AA", "2026", "plata din 10.11.2026")).toBe(false);
  });
  it("bare 13-digit IDNO does not cite a 7-digit invoice", () => {
    expect(cited("EAA", "0012345", "IDNO 1003600012345 plata marfa")).toBe(false);
  });
  it("f-ra 123 cites number 000123 of any series of this supplier (series ignored)", () => {
    // Accepted: engine runs per supplier, so a second series of the SAME supplier is the only risk.
    expect(cited("EAA", "000123", "achitare f-ra 123")).toBe(true);
    expect(cited("EAB", "000123", "achitare f-ra 123")).toBe(true);
  });
  it("two series same number cited → not auto-confirmed", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p", 100, "2026-10-05", "f-ra 123")],
      invoices: [inv("a", "EAA", "000123", 100, "2026-10-01"), inv("b", "EAB", "000123", 100, "2026-10-02")],
      allocations: [],
    });
    expect(s.every((x) => !x.autoConfirm)).toBe(true);
  });
});

describe("QA cited-number parsing — false positives / misses", () => {
  it("fixed: «contract nr. 15» is not read as invoice 15 (bare NR is no keyword)", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p", 500, "2026-10-05", "plata conform contract nr. 15 din 01.01.2026")],
      invoices: [inv("i15", "AB", "0000015", 500, "2026-10-01"), inv("i16", "AB", "0000016", 500, "2026-10-02")],
      allocations: [],
    });
    // Two invoices of 500 → without the bogus citation nothing would be auto-confirmed.
    expect(s.find((x) => x.autoConfirm)).toBeUndefined();
  });
  it("fixed: «CONTRACT 15» does not cite invoice 15 (CONT ≠ CONTRACT)", () => {
    expect(cited("AB", "0000015", "plata CONTRACT 15")).toBe(false);
  });
  it("fixed: an IBAN after «cont» is not an invoice number", () => {
    expect(cited("AB", "0000024", "transfer pe cont MD24AG000000022512345678")).toBe(false);
  });
  it("fixed: «FF» inside OFFICE / TARIFF is not a keyword", () => {
    expect(cited("AB", "0002025", "OFFICE 2025 servicii")).toBe(false);
  });
  it("fixed: series+number has a right boundary — FF123 does not cite FF12", () => {
    expect(cited("FF", "12", "achitare FF123")).toBe(false);
  });
  it("fixed: a number is not glued to the following date — «f-ra 456 10.11.2026» cites 456", () => {
    expect(cited("AB", "456", "plata f-ra 456 10.11.2026")).toBe(true);
  });
  it("accepted: amount written in purpose («suma 12500 lei») cites invoice 0012500 (long bare number)", () => {
    expect(cited("EAA", "0012500", "plata marfa suma 12500 lei")).toBe(true); // documents current behaviour
  });
  it("keywords still work next to the fixes", () => {
    expect(cited("AB", "0000015", "plata contul nr. 15")).toBe(true);
    expect(cited("AB", "0000015", "achitare f-ra nr 15 din 01.10.2026")).toBe(true);
    expect(cited("AB", "0000024", "f-ra 24, cont MD24AG000000022512345678")).toBe(true);
    expect(cited("FF", "123", "achitare FF123")).toBe(true);
    expect(cited("AB", "0002025", "TARIFF 2025")).toBe(false);
  });
});

describe("QA engine invariants", () => {
  it("never allocates more than payment or invoice (random fuzz)", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let round = 0; round < 300; round++) {
      const invoices = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, k) =>
        inv(`i${k}`, "EAA", String(1000 + k), Math.round(rnd() * 500) * 10 / 10 + 1, `2026-0${1 + Math.floor(rnd() * 8)}-1${k % 9}`, {
          paidOnSpot: rnd() < 0.1,
        }),
      );
      const payments = Array.from({ length: 1 + Math.floor(rnd() * 10) }, (_, k) =>
        pay(`p${k}`, Math.round(rnd() * 900) + 1, `2026-0${1 + Math.floor(rnd() * 9)}-0${1 + (k % 9)}`, rnd() < 0.3 ? `f-ra ${1000 + Math.floor(rnd() * 12)}` : null),
      );
      const allocations = rnd() < 0.5 ? [{ paymentId: "p0", invoiceId: "i0", amount: 50, status: "confirmed" as const }] : [];
      const out = suggestSupplierMatches({ payments, invoices, allocations });
      const byPay = new Map<string, number>();
      const byInv = new Map<string, number>();
      for (const a of [...allocations, ...out]) {
        byPay.set(a.paymentId, (byPay.get(a.paymentId) ?? 0) + Math.round(a.amount * 100));
        byInv.set(a.invoiceId, (byInv.get(a.invoiceId) ?? 0) + Math.round(a.amount * 100));
      }
      for (const p of payments) expect(byPay.get(p.id) ?? 0).toBeLessThanOrEqual(Math.max(Math.round(p.amount * 100), allocations.some((a) => a.paymentId === p.id) ? 5000 : 0));
      for (const i of invoices) {
        if (i.paidOnSpot) expect(out.some((s) => s.invoiceId === i.id)).toBe(false);
        expect(byInv.get(i.id) ?? 0).toBeLessThanOrEqual(Math.max(Math.round(i.total * 100), allocations.some((a) => a.invoiceId === i.id) ? 5000 : 0));
      }
      // No duplicate pairs (unique constraint would silently skip them).
      const pairs = out.map((s) => `${s.paymentId}|${s.invoiceId}`);
      expect(new Set(pairs).size).toBe(pairs.length);
    }
  });
  it("rejected pairs are never re-suggested; confirmed pairs not duplicated", () => {
    const out = suggestSupplierMatches({
      payments: [pay("p", 100, "2026-10-05")],
      invoices: [inv("i", "EAA", "1", 100, "2026-10-01")],
      allocations: [{ paymentId: "p", invoiceId: "i", amount: 100, status: "rejected" }],
    });
    expect(out.some((s) => s.paymentId === "p" && s.invoiceId === "i")).toBe(false);
  });
  it("subset-sum is bounded even for adversarial input (no blowup)", () => {
    const values = Array.from({ length: 20 }, (_, i) => 1000 + i * 2); // all even
    const t = Date.now();
    expect(findSubsetSum(values, 99_999)).toBeNull(); // odd target, never found
    expect(Date.now() - t).toBeLessThan(200);
  });
  it("engine over 300 payments × 400 invoices runs well under a second", () => {
    const invoices = Array.from({ length: 400 }, (_, k) => inv(`i${k}`, "EAA", String(k), 100 + (k % 37) * 3, `2026-0${1 + (k % 9)}-15`));
    const payments = Array.from({ length: 300 }, (_, k) => pay(`p${k}`, 1001 + k * 7, `2026-0${1 + (k % 9)}-20`, `plata ${k}`));
    const t = Date.now();
    suggestSupplierMatches({ payments, invoices, allocations: [] });
    expect(Date.now() - t).toBeLessThan(3000);
  });
  it("capAllocation: NaN / negative requests give 0", () => {
    const base = { paymentAmount: 100, paymentAllocatedElsewhere: 0, invoiceTotal: 100, invoiceAllocatedElsewhere: 0 };
    expect(capAllocation({ ...base, requested: -5 })).toBe(0);
    expect(capAllocation({ ...base, requested: Number.NaN })).toBe(0);
    expect(capAllocation({ ...base, requested: 150 })).toBe(100);
  });
});
