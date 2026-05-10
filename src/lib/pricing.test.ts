import { describe, expect, it } from "vitest";
import { pickProductPrice } from "./pricing";

describe("pickProductPrice", () => {
  it("returns sellPrice for non-dealers", () => {
    const out = pickProductPrice({ sellPrice: 200, dealerPrice: 150 }, false);
    expect(out).toEqual({ displayPrice: 200, priceTier: "retail" });
  });

  it("returns dealerPrice for dealers", () => {
    const out = pickProductPrice({ sellPrice: 200, dealerPrice: 150 }, true);
    expect(out).toEqual({ displayPrice: 150, priceTier: "dealer" });
  });

  it("does not silently fall back when dealer price is missing", () => {
    // We intentionally surface null instead of returning the retail price.
    // That way the dealer sees "no dealer price" in the UI and the studio
    // notices the catalog gap rather than charging retail to a dealer.
    const out = pickProductPrice({ sellPrice: 200, dealerPrice: null }, true);
    expect(out).toEqual({ displayPrice: null, priceTier: "dealer" });
  });

  it("returns null for non-dealers when sellPrice is missing", () => {
    const out = pickProductPrice({ sellPrice: null, dealerPrice: 150 }, false);
    expect(out).toEqual({ displayPrice: null, priceTier: "retail" });
  });
});
