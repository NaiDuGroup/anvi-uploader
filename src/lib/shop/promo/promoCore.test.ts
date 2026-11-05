import { describe, expect, it } from "vitest";
import { SHOP_MIN_PAYABLE_MDL } from "../constants";
import {
  capPromoDiscount,
  evaluatePromo,
  normalizePromoCode,
  promoDiscount,
  promoLineEligible,
  promoStaffNoteRu,
  type PromoCartInput,
  type PromoCodeRule,
} from "./promoCore";

const NOW = new Date("2026-11-10T10:00:00.000Z");

function rule(over: Partial<PromoCodeRule> = {}): PromoCodeRule {
  return {
    id: "p1",
    code: "SUMMER10",
    type: "percent",
    value: 10,
    minOrderMdl: null,
    validFrom: null,
    validTo: null,
    maxUsesTotal: null,
    maxUsesPerCustomer: null,
    categories: [],
    products: [],
    active: true,
    ...over,
  };
}

function cart(over: Partial<PromoCartInput> = {}): PromoCartInput {
  return {
    lines: [
      { total: 300, slug: "cana-alba", category: "cani" },
      { total: 200, slug: "tricou-alb", category: "tricouri" },
    ],
    deliveryPrice: 45,
    email: "ion@example.com",
    now: NOW,
    uses: { total: 0, customer: 0 },
    ...over,
  };
}

describe("normalizePromoCode", () => {
  it("trims and upper-cases", () => {
    expect(normalizePromoCode("  summer10 ")).toBe("SUMMER10");
    expect(normalizePromoCode("lansare-2026_a")).toBe("LANSARE-2026_A");
  });
  it("refuses anything that cannot be a code", () => {
    expect(normalizePromoCode("")).toBeNull();
    expect(normalizePromoCode("ab cd")).toBeNull();
    expect(normalizePromoCode("DROP;TABLE")).toBeNull();
    expect(normalizePromoCode("x".repeat(41))).toBeNull();
    expect(normalizePromoCode(42)).toBeNull();
  });
});

describe("evaluatePromo — validation", () => {
  it("unknown and inactive codes answer the same «invalid»", () => {
    expect(evaluatePromo(null, cart())).toEqual({ ok: false, reason: "invalid" });
    expect(evaluatePromo(rule({ active: false }), cart())).toEqual({ ok: false, reason: "invalid" });
    expect(evaluatePromo(rule({ type: "bogus" }), cart())).toEqual({ ok: false, reason: "invalid" });
  });

  it("dates: not started, valid on the edges, expired", () => {
    expect(evaluatePromo(rule({ validFrom: new Date(NOW.getTime() + 1) }), cart())).toMatchObject({ ok: false, reason: "not_started" });
    expect(evaluatePromo(rule({ validFrom: NOW, validTo: NOW }), cart()).ok).toBe(true);
    expect(evaluatePromo(rule({ validTo: new Date(NOW.getTime() - 1) }), cart())).toMatchObject({ ok: false, reason: "expired" });
  });

  it("total limit counts paid + held unpaid uses", () => {
    expect(evaluatePromo(rule({ maxUsesTotal: 5 }), cart({ uses: { total: 4, customer: 0 } })).ok).toBe(true);
    expect(evaluatePromo(rule({ maxUsesTotal: 5 }), cart({ uses: { total: 5, customer: 0 } }))).toMatchObject({
      ok: false,
      reason: "limit_reached",
    });
  });

  it("per-customer limit needs the e-mail", () => {
    const r = rule({ maxUsesPerCustomer: 1 });
    expect(evaluatePromo(r, cart({ email: null }))).toMatchObject({ ok: false, reason: "email_required" });
    expect(evaluatePromo(r, cart({ uses: { total: 3, customer: 1 } }))).toMatchObject({ ok: false, reason: "customer_limit" });
    expect(evaluatePromo(r, cart({ uses: { total: 3, customer: 0 } })).ok).toBe(true);
  });

  it("minimum compares to the eligible subtotal", () => {
    const r = rule({ categories: ["cani"], minOrderMdl: 400 });
    // The whole cart is 500, but only the mug (300) qualifies.
    expect(evaluatePromo(r, cart())).toEqual({ ok: false, reason: "min_total", minOrderMdl: 400 });
    expect(evaluatePromo(rule({ minOrderMdl: 500 }), cart()).ok).toBe(true);
    expect(evaluatePromo(rule({ minOrderMdl: 500.01 }), cart())).toMatchObject({ reason: "min_total" });
  });

  it("categories / products: discount only on eligible lines; none eligible → not_applicable", () => {
    const r = evaluatePromo(rule({ categories: ["tricouri"] }), cart());
    expect(r).toMatchObject({ ok: true, eligibleSubtotal: 200, discount: 20, subtotal: 500, total: 525 });
    expect(evaluatePromo(rule({ products: ["cana-alba"] }), cart())).toMatchObject({ ok: true, discount: 30 });
    expect(evaluatePromo(rule({ categories: ["pixuri"] }), cart())).toEqual({ ok: false, reason: "not_applicable" });
    // Category OR product.
    expect(evaluatePromo(rule({ categories: ["cani"], products: ["tricou-alb"] }), cart())).toMatchObject({ discount: 50 });
  });

  it("a line with no known product does not match a restricted code", () => {
    expect(promoLineEligible(rule({ categories: ["cani"] }), { total: 10, slug: null, category: null })).toBe(false);
    expect(promoLineEligible(rule(), { total: 10, slug: null, category: null })).toBe(true);
  });
});

describe("evaluatePromo — pricing", () => {
  it("percent of the subtotal; delivery not discounted", () => {
    expect(evaluatePromo(rule({ value: 10 }), cart())).toMatchObject({
      ok: true,
      discount: 50,
      subtotal: 500,
      deliveryPrice: 45,
      total: 495,
    });
  });

  it("fixed is capped at the eligible subtotal", () => {
    expect(evaluatePromo(rule({ type: "fixed", value: 100 }), cart())).toMatchObject({ discount: 100, total: 445 });
    expect(evaluatePromo(rule({ type: "fixed", value: 1000, categories: ["tricouri"] }), cart())).toMatchObject({
      discount: 200,
      total: 345,
    });
  });

  it("free delivery takes the delivery off; pickup has nothing to take", () => {
    expect(evaluatePromo(rule({ type: "free_delivery", value: 0 }), cart())).toMatchObject({ discount: 45, total: 500 });
    expect(evaluatePromo(rule({ type: "free_delivery", value: 0 }), cart({ deliveryPrice: 0 }))).toEqual({
      ok: false,
      reason: "not_applicable",
    });
  });

  it("rounds to bani", () => {
    expect(promoDiscount("percent", 15, 33.33, 0)).toBe(5);
    expect(promoDiscount("percent", 7, 99.99, 0)).toBe(7);
    const r = evaluatePromo(rule({ value: 12.5 }), cart({ lines: [{ total: 99.99, slug: "a", category: "cani" }] }));
    expect(r).toMatchObject({ discount: 12.5, total: 132.49 });
  });

  it("percent above 100 never makes a negative total", () => {
    expect(promoDiscount("percent", 150, 200, 0)).toBe(200);
    expect(promoDiscount("fixed", -5, 200, 0)).toBe(0);
  });

  it("an applied code says whether the minimum payable cut it", () => {
    expect(evaluatePromo(rule({ value: 10 }), cart())).toMatchObject({ ok: true, limited: false });
    expect(evaluatePromo(rule({ value: 10 }), cart())).not.toHaveProperty("uncappedDiscount");
  });

  it("staff note line in Russian", () => {
    expect(promoStaffNoteRu({ code: "SUMMER10", type: "percent", value: 10, discount: 50 })).toBe("Промокод SUMMER10 (−10%): −50 MDL");
    expect(promoStaffNoteRu({ code: "SHIP", type: "free_delivery", value: 0, discount: 45 })).toBe(
      "Промокод SHIP (бесплатная доставка): −45 MDL",
    );
    expect(promoStaffNoteRu({ code: "MINUS", type: "fixed", value: 12.5, discount: 12.5 })).toBe("Промокод MINUS (−12.50 MDL): −12.50 MDL");
  });
});

describe("minimum payable (gateways refuse 0 lei)", () => {
  const pickup = (total: number) => cart({ lines: [{ total, slug: "a", category: "cani" }], deliveryPrice: 0 });

  it("is 10 lei", () => {
    expect(SHOP_MIN_PAYABLE_MDL).toBe(10);
  });

  it("capPromoDiscount keeps subtotal + delivery − discount ≥ the minimum", () => {
    expect(capPromoDiscount(100, 300, 0)).toEqual({ discount: 100, limited: false });
    expect(capPromoDiscount(300, 300, 0)).toEqual({ discount: 290, limited: true });
    expect(capPromoDiscount(300, 300, 45)).toEqual({ discount: 300, limited: false });
    expect(capPromoDiscount(50, 55, 0)).toEqual({ discount: 45, limited: true });
    expect(capPromoDiscount(5, 10, 0)).toEqual({ discount: 0, limited: true });
    expect(capPromoDiscount(5, 8, 0)).toEqual({ discount: 0, limited: true });
    expect(capPromoDiscount(0, 8, 0)).toEqual({ discount: 0, limited: false });
    expect(capPromoDiscount(20.5, 30.25, 0)).toEqual({ discount: 20.25, limited: true });
  });

  it("fixed bigger than the order: limited to leave 10 lei", () => {
    expect(evaluatePromo(rule({ type: "fixed", value: 100 }), pickup(100))).toMatchObject({
      ok: true,
      discount: 90,
      total: 10,
      limited: true,
      uncappedDiscount: 100,
    });
    // Exactly at the edge: 110 − 100 = 10, not limited.
    expect(evaluatePromo(rule({ type: "fixed", value: 100 }), pickup(110))).toMatchObject({ discount: 100, total: 10, limited: false });
  });

  it("100 % off: limited, the customer pays 10 lei", () => {
    expect(evaluatePromo(rule({ value: 100 }), pickup(250))).toMatchObject({ discount: 240, total: 10, limited: true });
  });

  it("delivery counts toward the amount payable", () => {
    // 20 + 45 courier: a 100-lei code takes the 20 off (eligible subtotal), 45 left to pay.
    expect(evaluatePromo(rule({ type: "fixed", value: 100 }), cart({ lines: [{ total: 20, slug: "a", category: "cani" }] }))).toMatchObject({
      discount: 20,
      total: 45,
      limited: false,
    });
    // Free delivery on a 5-lei cart: 5 + 45 → only 40 off, 10 left.
    expect(
      evaluatePromo(rule({ type: "free_delivery", value: 0 }), cart({ lines: [{ total: 5, slug: "a", category: "cani" }] })),
    ).toMatchObject({ discount: 40, total: 10, limited: true });
  });

  it("an order at or under 10 lei gets nothing (never a higher price)", () => {
    expect(evaluatePromo(rule({ type: "fixed", value: 5 }), pickup(8))).toEqual({
      ok: false,
      reason: "min_payable",
      minOrderMdl: 10,
    });
    expect(evaluatePromo(rule({ value: 50 }), pickup(10))).toMatchObject({ ok: false, reason: "min_payable" });
    expect(evaluatePromo(rule({ value: 50 }), pickup(12))).toMatchObject({ ok: true, discount: 2, total: 10, limited: true });
  });

  it("the staff note says the discount was limited", () => {
    expect(promoStaffNoteRu({ code: "BIG", type: "fixed", value: 100, discount: 90, limited: true })).toBe(
      "Промокод BIG (−100 MDL): −90 MDL (ограничено: мин. к оплате 10 MDL)",
    );
  });
});
