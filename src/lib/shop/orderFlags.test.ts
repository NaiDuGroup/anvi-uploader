import { describe, expect, it } from "vitest";
import {
  countsTowardClientDebt,
  isShopTestOrder,
  isUnpaidShopOrder,
  splitShopOrderNotes,
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

describe("splitShopOrderNotes", () => {
  it("recognises the checkout summary and keeps nothing prominent", () => {
    const p = splitShopOrderNotes("Сайт · Самовывоз\n1) Баннер 150×100 см, баннер Frontlit 440 г — 1 шт.");
    expect(p.auto).toBe(true);
    expect(p.comments).toEqual([]);
    expect(p.extra).toEqual([]);
    expect(p.summary).toContain("1) Баннер");
  });
  it("strips the test prefix, picks customer line notes and promo/tail rows", () => {
    const p = splitShopOrderNotes(
      "[ТЕСТ сайт] Сайт · Курьер по Кишинёву, Кишинёв, ул. Мира 1 (домофон 12)\n1) Визитки — 100 шт. — прим.: матовые, пожалуйста\n2) Флаер\n…и ещё 2 позиции\nПромокод X: −50 MDL",
    );
    expect(p.auto).toBe(true);
    expect(p.comments).toEqual(["матовые, пожалуйста"]);
    expect(p.extra).toEqual([]);
  });
  it("keeps staff-written lines visible", () => {
    const p = splitShopOrderNotes("Сайт · Самовывоз\n1) Баннер — 1 шт.\nклиент заберёт в пятницу");
    expect(p.extra).toEqual(["клиент заберёт в пятницу"]);
  });
  it("treats notes rewritten by staff as ordinary notes", () => {
    expect(splitShopOrderNotes("позвонить перед выдачей")).toEqual({
      auto: false,
      summary: "",
      comments: [],
      extra: ["позвонить перед выдачей"],
    });
    expect(splitShopOrderNotes(null).auto).toBe(false);
  });
});
