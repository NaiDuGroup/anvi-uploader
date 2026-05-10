import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { computeInclusiveVat, computeInvoiceTotals } from "./invoiceTotals";

describe("computeInclusiveVat (20% inclusive)", () => {
  it("matches the reference PDF: 2900 → 483.33", () => {
    const vat = computeInclusiveVat(new Prisma.Decimal("2900"), 20);
    expect(vat.toString()).toBe("483.33");
  });

  it("100 → 16.67", () => {
    const vat = computeInclusiveVat(new Prisma.Decimal("100"), 20);
    expect(vat.toString()).toBe("16.67");
  });

  it("0 returns 0", () => {
    const vat = computeInclusiveVat(new Prisma.Decimal("0"), 20);
    expect(vat.toString()).toBe("0");
  });

  it("rate 0% returns 0", () => {
    const vat = computeInclusiveVat(new Prisma.Decimal("100"), 0);
    expect(vat.toString()).toBe("0");
  });
});

describe("computeInvoiceTotals", () => {
  it("computes single-line totals (qty * price, vat 20% inclusive)", () => {
    const totals = computeInvoiceTotals(
      [{ quantity: 20, unitPrice: 145 }],
      20,
    );
    expect(totals.subtotal.toString()).toBe("2900");
    expect(totals.vatAmount.toString()).toBe("483.33");
    expect(totals.totalAmount.toString()).toBe("2900");
    expect(totals.lines).toHaveLength(1);
    expect(totals.lines[0].lineTotal.toString()).toBe("2900");
  });

  it("aggregates multi-line totals", () => {
    const totals = computeInvoiceTotals(
      [
        { quantity: 1, unitPrice: 100 },
        { quantity: 2, unitPrice: 50 },
        { quantity: 3, unitPrice: 33.33 },
      ],
      20,
    );
    // 100 + 100 + 99.99 = 299.99
    expect(totals.subtotal.toString()).toBe("299.99");
    expect(totals.totalAmount.toString()).toBe("299.99");
    expect(parseFloat(totals.vatAmount.toString())).toBeCloseTo(50, 1);
  });

  it("supports fractional quantities up to 3 decimals", () => {
    const totals = computeInvoiceTotals(
      [{ quantity: 1.5, unitPrice: 200 }],
      20,
    );
    expect(totals.subtotal.toString()).toBe("300");
  });
});
