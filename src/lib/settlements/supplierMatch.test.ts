import { describe, it, expect } from "vitest";
import {
  capAllocation,
  extractCitedRefs,
  findSubsetSum,
  invoicePaymentStatus,
  isInvoiceCited,
  suggestSupplierMatches,
  type SmInvoice,
  type SmPayment,
} from "./supplierMatch";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

function inv(id: string, total: number, date: string, extra: Partial<SmInvoice> = {}): SmInvoice {
  return { id, seria: "EBF", number: `000${id.replace(/\D/g, "").padStart(6, "0")}`, total, issueDate: day(date), paidOnSpot: false, ...extra };
}
function pay(id: string, amount: number, date: string, purpose: string | null = null, kind: "bank" | "card" = "bank"): SmPayment {
  return { id, amount, date: day(date), purpose, kind, document: id };
}

describe("extractCitedRefs / isInvoiceCited", () => {
  const i = { seria: "EBF", number: "000640800" };
  it("finds series + number, glued or spaced", () => {
    expect(isInvoiceCited(i, extractCitedRefs("plata conf. factura EBF000640800 din 01.10.2026"))).toBe(true);
    expect(isInvoiceCited(i, extractCitedRefs("conf f-raEBF 000640800"))).toBe(true);
    expect(isInvoiceCited(i, extractCitedRefs("conf EBF640800"))).toBe(true);
  });
  it("finds a bare long number and wrap-split digits", () => {
    expect(isInvoiceCited(i, extractCitedRefs("achitare pentru 640800"))).toBe(true);
    expect(isInvoiceCited(i, extractCitedRefs("conf. f-ra 640 800 din 02.10"))).toBe(true);
  });
  it("short numbers need a keyword", () => {
    const short = { seria: "AA", number: "123" };
    expect(isInvoiceCited(short, extractCitedRefs("plata cont nr. 123 din 02.10.2026"))).toBe(true);
    expect(isInvoiceCited(short, extractCitedRefs("suma 123 lei"))).toBe(false);
  });
  it("does not confuse a different number", () => {
    expect(isInvoiceCited(i, extractCitedRefs("factura EBF000640801"))).toBe(false);
    expect(isInvoiceCited(i, extractCitedRefs(null))).toBe(false);
  });
});

describe("findSubsetSum", () => {
  it("finds the oldest-first subset", () => {
    expect(findSubsetSum([100, 200, 300, 50], 300)).toEqual([0, 1]);
    expect(findSubsetSum([100, 200], 150)).toBeNull();
    expect(findSubsetSum([300], 300)).toBeNull();
  });
  it("respects the size and node limits", () => {
    expect(findSubsetSum([1, 1, 1, 1, 1, 1], 6)).toBeNull();
    expect(findSubsetSum(Array.from({ length: 20 }, () => 7), 1, { maxNodes: 50 })).toBeNull();
  });
});

describe("suggestSupplierMatches", () => {
  it("cited + exact amount → 100 and auto-confirm", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p1", 1500, "2026-10-05", "plata conf factura EBF000000001")],
      invoices: [inv("i1", 1500, "2026-10-01"), inv("i2", 1500, "2026-10-02")],
      allocations: [],
    });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ invoiceId: "i1", amount: 1500, confidence: 100, signal: "cited", autoConfirm: true });
  });

  it("cited but amount differs → partial, no auto-confirm, FIFO rest", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p1", 1000, "2026-10-05", "f-ra 640802")],
      invoices: [inv("i1", 300, "2026-09-01"), inv("i2", 600, "2026-10-01", { number: "000640802" })],
      allocations: [],
    });
    expect(s[0]).toMatchObject({ invoiceId: "i2", amount: 600, signal: "cited", autoConfirm: false });
    expect(s[1]).toMatchObject({ invoiceId: "i1", amount: 300, signal: "fifo" });
    expect(s.reduce((a, x) => a + x.amount, 0)).toBe(900);
  });

  it("unique exact amount in the window → 90 auto-confirm", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p1", 777, "2026-10-20")],
      invoices: [inv("i1", 500, "2026-10-01"), inv("i2", 777, "2026-10-10")],
      allocations: [],
    });
    expect(s[0]).toMatchObject({ invoiceId: "i2", confidence: 90, signal: "exact", autoConfirm: true });
  });

  it("exact amount outside the window is not matched by amount", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p1", 777, "2026-10-20")],
      invoices: [inv("i1", 777, "2026-01-10")],
      allocations: [],
    });
    expect(s[0]?.signal).toBe("fifo");
  });

  it("two equal payments compete → no auto-confirm", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p1", 100, "2026-10-02"), pay("p2", 100, "2026-10-03")],
      invoices: [inv("i1", 100, "2026-10-01")],
      allocations: [],
    });
    expect(s[0]).toMatchObject({ paymentId: "p1", invoiceId: "i1", confidence: 75, autoConfirm: false });
    expect(s).toHaveLength(1);
  });

  it("sum of several invoices", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p1", 450, "2026-10-20")],
      invoices: [inv("i1", 100, "2026-10-01"), inv("i2", 200, "2026-10-02"), inv("i3", 150, "2026-10-03")],
      allocations: [],
    });
    expect(s.every((x) => x.signal === "sum")).toBe(true);
    expect(s.map((x) => x.invoiceId).sort()).toEqual(["i1", "i2", "i3"]);
  });

  it("never over-allocates payment or invoice; honours confirmed + rejected", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p1", 1000, "2026-10-20"), pay("p2", 50, "2026-10-21")],
      invoices: [inv("i1", 400, "2026-10-01"), inv("i2", 400, "2026-10-02")],
      allocations: [
        { paymentId: "p1", invoiceId: "i1", amount: 400, status: "confirmed" },
        { paymentId: "p1", invoiceId: "i2", amount: 0, status: "rejected" },
      ],
    });
    const byInv = new Map<string, number>();
    for (const x of s) byInv.set(x.invoiceId, (byInv.get(x.invoiceId) ?? 0) + x.amount);
    expect(byInv.get("i1") ?? 0).toBe(0);
    expect(s.find((x) => x.paymentId === "p1" && x.invoiceId === "i2")).toBeUndefined();
    expect(byInv.get("i2")).toBe(50);
  });

  it("skips invoices paid on the spot (B/f)", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p1", 200, "2026-10-05")],
      invoices: [inv("i1", 200, "2026-10-01", { paidOnSpot: true })],
      allocations: [],
    });
    expect(s).toEqual([]);
  });

  it("FIFO does not use invoices issued well after the payment", () => {
    const s = suggestSupplierMatches({
      payments: [pay("p1", 200, "2026-01-05")],
      invoices: [inv("i1", 300, "2026-06-01")],
      allocations: [],
    });
    expect(s).toEqual([]);
  });
});

describe("invoicePaymentStatus / capAllocation", () => {
  it("statuses", () => {
    expect(invoicePaymentStatus(100, 100, false)).toBe("paid");
    expect(invoicePaymentStatus(100, 40, false)).toBe("partial");
    expect(invoicePaymentStatus(100, 0, false)).toBe("unpaid");
    expect(invoicePaymentStatus(100, 0, true)).toBe("receipt");
  });
  it("caps by payment and invoice room", () => {
    expect(capAllocation({ requested: 500, paymentAmount: 300, paymentAllocatedElsewhere: 100, invoiceTotal: 1000, invoiceAllocatedElsewhere: 0 })).toBe(200);
    expect(capAllocation({ requested: 500, paymentAmount: 1000, paymentAllocatedElsewhere: 0, invoiceTotal: 400, invoiceAllocatedElsewhere: 350 })).toBe(50);
    expect(capAllocation({ requested: 10, paymentAmount: 100, paymentAllocatedElsewhere: 100, invoiceTotal: 400, invoiceAllocatedElsewhere: 0 })).toBe(0);
  });
});
