import { describe, expect, it } from "vitest";
import { SHOP_CHECKOUT_MAX_LINES } from "@/lib/shop/constants";
import {
  CART_MAX_LINES,
  cartIsFull,
  cartOverLimit,
  cartReducer,
  cartRefuses,
  parseCart,
  serializeCart,
  type CartLine,
} from "./cart";
import { checkoutOutcome } from "./checkout";
import { shopT } from "./i18n";

const mugLine = (id: string): CartLine => ({
  id,
  slug: "cana-alba",
  title: "Cană",
  optionsText: "320 ml",
  image: null,
  quote: { kind: "mug", productId: "v1", quantity: 1 },
  files: [{ fileKey: "uploads/a.png", fileName: "a.png" }],
  addedAt: 1,
});
const cart = (n: number): CartLine[] => Array.from({ length: n }, (_, i) => mugLine(`l${i}`));

describe("cart line limit = checkout line limit", () => {
  it("is one shared constant (30)", () => {
    expect(CART_MAX_LINES).toBe(SHOP_CHECKOUT_MAX_LINES);
    expect(CART_MAX_LINES).toBe(30);
  });

  it("a full cart refuses a new line (add, or update of an unknown id) but still edits its own lines", () => {
    const full = cart(30);
    expect(cartIsFull(full)).toBe(true);
    expect(cartIsFull(cart(29))).toBe(false);
    expect(cartRefuses(full, { type: "add", line: mugLine("x") })).toBe(true);
    expect(cartReducer(full, { type: "add", line: mugLine("x") })).toBe(full);
    expect(cartReducer(full, { type: "update", line: mugLine("x") })).toBe(full);
    const edited = { ...mugLine("l3"), title: "Edited" };
    expect(cartRefuses(full, { type: "update", line: edited })).toBe(false);
    expect(cartReducer(full, { type: "update", line: edited })[3]!.title).toBe("Edited");
    expect(cartReducer(cart(29), { type: "add", line: mugLine("x") })).toHaveLength(30);
    expect(cartRefuses(full, { type: "remove", id: "l0" })).toBe(false);
  });

  it("an older cart saved with more than 30 lines loads whole and is marked over the limit", () => {
    const old = parseCart(serializeCart(cart(45)));
    expect(old).toHaveLength(45);
    expect(cartOverLimit(old)).toBe(true);
    expect(cartOverLimit(cart(30))).toBe(false);
    // Removing lines works; adding does not.
    expect(cartReducer(old, { type: "remove", id: "l0" })).toHaveLength(44);
    expect(cartReducer(old, { type: "add", line: mugLine("x") })).toBe(old);
  });

  it("the checkout answer `lines: too_big` is told apart from other invalid input", () => {
    const out = checkoutOutcome(400, { error: "invalid_input", fieldErrors: { lines: "too_big" } });
    expect(out).toMatchObject({ kind: "invalid", tooManyLines: true });
    const other = checkoutOutcome(400, { error: "invalid_input", fieldErrors: { "customer.name": "too_small" } });
    expect(other).not.toHaveProperty("tooManyLines");
  });

  it("the messages name the limit in all three languages", () => {
    expect(shopT("ru")("cartFull", { n: 30 })).toBe("В одном заказе до 30 позиций. Оформите этот заказ, а остальное — следующим.");
    for (const lang of ["ro", "ru", "en"] as const) {
      expect(shopT(lang)("cartFull", { n: 30 })).toContain("30");
      expect(shopT(lang)("cartOverLimit", { n: 30, count: 45 })).toMatch(/30[\s\S]*45/);
    }
  });
});
