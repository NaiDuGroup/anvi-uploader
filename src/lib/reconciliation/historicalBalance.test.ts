import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

const ZERO = new Prisma.Decimal(0);

/** Mirrors computeBalanceReport: invoiced + HISTORICAL synth − paid. */
function netBalance(
  invoiced: Prisma.Decimal,
  paid: Prisma.Decimal,
  historicalInvoiced: Prisma.Decimal,
): Prisma.Decimal {
  return invoiced.plus(historicalInvoiced).minus(paid);
}

describe("legacy HISTORICAL settlement balance math", () => {
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
