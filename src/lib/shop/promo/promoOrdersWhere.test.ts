import { describe, expect, it } from "vitest";
import { PROMO_PENDING_HOLD_MS, promoHeldOrdersWhere, promoRealOrdersWhere } from "./promoOrdersWhere";

const NOW = new Date("2026-11-05T12:00:00Z");

describe("promo orders where-clauses", () => {
  it("real orders exclude trashed and test-payment orders", () => {
    expect(promoRealOrdersWhere("p1")).toEqual({ promoCodeId: "p1", deletedAt: null, NOT: { paymentProvider: "test" } });
    expect(promoRealOrdersWhere({ in: ["a", "b"] })).toEqual({
      promoCodeId: { in: ["a", "b"] },
      deletedAt: null,
      NOT: { paymentProvider: "test" },
    });
  });

  it("held orders are real unpaid orders inside the hold window", () => {
    expect(promoHeldOrdersWhere({ in: ["a"] }, NOW)).toEqual({
      promoCodeId: { in: ["a"] },
      deletedAt: null,
      NOT: { paymentProvider: "test" },
      paymentStatus: { not: "paid" },
      createdAt: { gte: new Date(NOW.getTime() - PROMO_PENDING_HOLD_MS) },
    });
  });
});
