import { describe, expect, it } from "vitest";
import {
  countsTowardClientDebt,
  isShopTestOrder,
  isUnpaidShopOrder,
  SHOP_TEST_ORDER_NOTE_PREFIX,
  UNPAID_SHOP_ORDER_WHERE,
} from "./orderFlags";

describe("isShopTestOrder", () => {
  it("storefront orders with the test provider or the notes prefix", () => {
    expect(isShopTestOrder({ source: "shop", paymentProvider: "test" })).toBe(true);
    expect(isShopTestOrder({ source: "shop", paymentProvider: null, notes: `${SHOP_TEST_ORDER_NOTE_PREFIX} Сайт · …` })).toBe(true);
    expect(isShopTestOrder({ source: "shop", paymentProvider: "paynet", notes: "Сайт · Самовывоз" })).toBe(false);
  });
  it("never a studio order", () => {
    expect(isShopTestOrder({ source: "studio", paymentProvider: "test", notes: SHOP_TEST_ORDER_NOTE_PREFIX })).toBe(false);
    expect(isShopTestOrder({})).toBe(false);
  });
});

describe("client debt", () => {
  it("unpaid storefront orders are not debt", () => {
    for (const paymentStatus of ["unpaid", "pending", "failed", "refunded"]) {
      const o = { isPaid: false, source: "shop", paymentStatus };
      expect(isUnpaidShopOrder(o)).toBe(true);
      expect(countsTowardClientDebt(o)).toBe(false);
    }
  });
  it("a paid storefront order un-ticked by staff is debt again; studio orders as before", () => {
    expect(countsTowardClientDebt({ isPaid: false, source: "shop", paymentStatus: "paid" })).toBe(true);
    expect(countsTowardClientDebt({ isPaid: false, source: "studio", paymentStatus: "unpaid" })).toBe(true);
    expect(countsTowardClientDebt({ isPaid: false })).toBe(true);
    expect(countsTowardClientDebt({ isPaid: true, source: "studio", paymentStatus: "unpaid" })).toBe(false);
  });
  it("Prisma condition matches the same orders", () => {
    expect(UNPAID_SHOP_ORDER_WHERE).toEqual({ source: "shop", paymentStatus: { not: "paid" } });
  });
});
