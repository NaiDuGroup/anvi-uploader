import { describe, expect, it } from "vitest";
import {
  applyBusinessCardMinimumLineTotal,
  businessCardPerCardRateMdl,
  computeBusinessCardLinePricing,
  effectivePaperCostPerSheet,
} from "./businessCardLinePricing";
import type { SheetPaperSnapshot } from "./types";
import {
  SHOP_BC_BACK_PER_CARD_MDL,
  SHOP_BC_PRICE_PER_CARD_MDL,
  shopBcTotalMdl,
} from "@/lib/storefront/businessCards";

const PAPER: SheetPaperSnapshot = {
  id: "paper-1",
  name: "Couche 300 g/m², A4+",
  sheetWidthCm: 22.5,
  sheetHeightCm: 32,
  costPerSheet: 3,
  retailPricePerSheet: 15,
  dealerPricePerSheet: 11,
};

describe("computeBusinessCardLinePricing", () => {
  it("bills one side per sheet at the retail rate", () => {
    const result = computeBusinessCardLinePricing({
      paperSnapshot: PAPER,
      avgPaperCostPerSheet: 2.5,
      sheetsUsed: 8,
      sides: "one",
      customerType: "retail",
    });

    expect(result.pricePerSheetMdl).toBe(15);
    expect(result.totalSellPriceMdl).toBe(120);
    expect(result.paperCostMdl).toBe(20);
    expect(result.estimatedProfitMdl).toBe(100);
  });

  it("doubles the sell for a double-sided run but not the paper COGS", () => {
    const oneSide = computeBusinessCardLinePricing({
      paperSnapshot: PAPER,
      avgPaperCostPerSheet: 2.5,
      sheetsUsed: 8,
      sides: "one",
      customerType: "retail",
    });
    const twoSides = computeBusinessCardLinePricing({
      paperSnapshot: PAPER,
      avgPaperCostPerSheet: 2.5,
      sheetsUsed: 8,
      sides: "two",
      customerType: "retail",
    });

    expect(twoSides.totalSellPriceMdl).toBe(oneSide.totalSellPriceMdl * 2);
    expect(twoSides.paperCostMdl).toBe(oneSide.paperCostMdl);
  });

  it("uses the dealer rate for dealers", () => {
    const result = computeBusinessCardLinePricing({
      paperSnapshot: PAPER,
      avgPaperCostPerSheet: 2.5,
      sheetsUsed: 8,
      sides: "one",
      customerType: "dealer",
    });

    expect(result.pricePerSheetMdl).toBe(11);
    expect(result.totalSellPriceMdl).toBe(88);
  });
});

describe("effectivePaperCostPerSheet", () => {
  it("prefers the weighted average over the catalog hint", () => {
    expect(effectivePaperCostPerSheet(PAPER, 2.5)).toBe(2.5);
  });

  it("falls back to the catalog hint when there were no receipts yet", () => {
    expect(effectivePaperCostPerSheet(PAPER, null)).toBe(3);
    expect(effectivePaperCostPerSheet(PAPER, 0)).toBe(3);
  });
});

describe("applyBusinessCardMinimumLineTotal", () => {
  const smallRun = computeBusinessCardLinePricing({
    paperSnapshot: PAPER,
    avgPaperCostPerSheet: 2.5,
    sheetsUsed: 1,
    sides: "one",
    customerType: "retail",
  });

  it("lifts a tiny run to the floor and keeps profit consistent", () => {
    const { pricing, upliftMdl } = applyBusinessCardMinimumLineTotal(smallRun, 100);

    expect(smallRun.totalSellPriceMdl).toBe(15);
    expect(upliftMdl).toBe(85);
    expect(pricing.totalSellPriceMdl).toBe(100);
    expect(pricing.estimatedProfitMdl).toBe(100 - pricing.paperCostMdl);
  });

  it("leaves the line alone when it already clears the floor or the floor is off", () => {
    expect(applyBusinessCardMinimumLineTotal(smallRun, 0).upliftMdl).toBe(0);
    expect(applyBusinessCardMinimumLineTotal(smallRun, 10).pricing).toBe(smallRun);
  });
});

describe("business cards: one price everywhere (the shop's per-card rate)", () => {
  it("retail business cards use the storefront per-card rate, flyers and dealers do not", () => {
    expect(businessCardPerCardRateMdl("business_card", "one", "retail")).toBe(SHOP_BC_PRICE_PER_CARD_MDL);
    expect(businessCardPerCardRateMdl("business_card", "two", "retail")).toBe(
      SHOP_BC_PRICE_PER_CARD_MDL + SHOP_BC_BACK_PER_CARD_MDL,
    );
    expect(businessCardPerCardRateMdl("flyer", "one", "retail")).toBeNull();
    expect(businessCardPerCardRateMdl("business_card", "one", "dealer")).toBeNull();
  });

  it("a staff / cabinet run is billed quantity × the shop rate, whatever the paper's sheet rate", () => {
    for (const sides of ["one", "two"] as const) {
      const rate = businessCardPerCardRateMdl("business_card", sides, "retail")!;
      const result = computeBusinessCardLinePricing({
        paperSnapshot: PAPER,
        avgPaperCostPerSheet: 2.5,
        sheetsUsed: 9,
        sides,
        customerType: "retail",
        perCard: { quantity: 100, rateMdl: rate },
      });
      // Same as the shop's 100-card pack.
      expect(result.totalSellPriceMdl).toBe(shopBcTotalMdl(100, sides));
      expect(result.paperCostMdl).toBe(23);
      expect(result.estimatedProfitMdl).toBe(result.totalSellPriceMdl - 23);
      expect(result.pricePerSheetMdl).toBeGreaterThan(0);
    }
  });

  it("keeps bani on an odd run", () => {
    const result = computeBusinessCardLinePricing({
      paperSnapshot: PAPER,
      avgPaperCostPerSheet: 2.5,
      sheetsUsed: 1,
      sides: "one",
      customerType: "retail",
      perCard: { quantity: 11, rateMdl: 1.5 },
    });
    expect(result.totalSellPriceMdl).toBe(16.5);
  });
});
