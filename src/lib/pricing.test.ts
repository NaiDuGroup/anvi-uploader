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

  it("passes through 2-decimal MDL prices without coercing to integer", () => {
    // `MugProduct.sellPrice` / `dealerPrice` migrated to `Decimal(12, 2)`;
    // serializers feed plain `number` into the picker. Fractional values
    // (`1.5 lei per piece`) must survive untouched so callers can multiply
    // by `copies` to produce a 2dp line total.
    const retail = pickProductPrice({ sellPrice: 1.5, dealerPrice: 0.9 }, false);
    expect(retail).toEqual({ displayPrice: 1.5, priceTier: "retail" });

    const dealer = pickProductPrice({ sellPrice: 1.5, dealerPrice: 0.9 }, true);
    expect(dealer).toEqual({ displayPrice: 0.9, priceTier: "dealer" });
  });
});
