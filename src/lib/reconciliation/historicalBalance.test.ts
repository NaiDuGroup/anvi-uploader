import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { historicalTransactionSchema } from "@/lib/validations";

const ZERO = new Prisma.Decimal(0);

/** Mirrors computeBalanceReport: invoiced + HISTORICAL synth − paid. */
function netBalance(
  invoiced: Prisma.Decimal,
  paid: Prisma.Decimal,
  historicalInvoiced: Prisma.Decimal,
): Prisma.Decimal {
  return invoiced.plus(historicalInvoiced).minus(paid);
}

describe("HISTORICAL settlement balance math", () => {
  it("nets a credit-only client to zero when marked HISTORICAL", () => {
    const paid = new Prisma.Decimal("1380.00");
    const historical = new Prisma.Decimal("1380.00");
    expect(netBalance(ZERO, paid, historical).equals(ZERO)).toBe(true);
  });

  it("leaves an unmatched credit as a creditor (negative balance)", () => {
    const paid = new Prisma.Decimal("1380.00");
    const balance = netBalance(ZERO, paid, ZERO);
    expect(balance.lessThan(ZERO)).toBe(true);
    expect(balance.negated().toFixed(2)).toBe("1380.00");
  });
});

describe("historicalTransactionSchema", () => {
  it("accepts empty body (document prefilled server-side)", () => {
    expect(historicalTransactionSchema.parse({})).toEqual({});
  });

  it("accepts a document label", () => {
    expect(
      historicalTransactionSchema.parse({ document: "nr.1", note: null }),
    ).toEqual({ document: "nr.1", note: null });
  });

  it("rejects blank document when provided", () => {
    expect(() =>
      historicalTransactionSchema.parse({ document: "   " }),
    ).toThrow();
  });
});
