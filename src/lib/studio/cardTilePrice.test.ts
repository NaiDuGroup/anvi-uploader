import { describe, expect, it } from "vitest";
import { SHOP_BC_PACKS, SHOP_BC_PRICE_PER_CARD_MDL, shopBcFromPrice, shopBcTotalMdl } from "@/lib/storefront/businessCards";
import { cardTilePriceLabel } from "./i18n.card";

describe("card gallery tile price", () => {
  it("is the smallest pack, front only, from the price config", () => {
    const { pack, totalMdl } = shopBcFromPrice();
    expect(pack).toBe(Math.min(...SHOP_BC_PACKS));
    expect(totalMdl).toBe(shopBcTotalMdl(pack, "one"));
    expect(totalMdl).toBe(Math.round(pack * SHOP_BC_PRICE_PER_CARD_MDL * 100) / 100);
  });

  it("reads «from X / N pcs» in each language", () => {
    expect(cardTilePriceLabel("ro").replace(/\s/g, " ")).toBe("de la 150 lei / 100 buc.");
    expect(cardTilePriceLabel("ru").replace(/\s/g, " ")).toBe("от 150 лей / 100 шт.");
    expect(cardTilePriceLabel("en").replace(/\s/g, " ")).toBe("from 150 lei / 100 pcs");
  });
});
