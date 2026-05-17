import { describe, expect, it } from "vitest";
import {
  computeLfInkSellPriceMdl,
  lfInkMarkupMultiplierUsed,
  mergeLfPricingWithInkSell,
} from "./lfInkSellPricing";
import {
  computeLfRollOrderEconomics,
  lfRollEconomicsWithRevenueMargin,
} from "./lfRollOrderEconomics";

const inkProd = {
  lfInkRetailMarkupMultiplier: 1.5,
  lfInkDealerMarkupMultiplier: 2.25,
};

describe("lfInkMarkupMultiplierUsed", () => {
  it("picks retail vs dealer multipliers", () => {
    expect(lfInkMarkupMultiplierUsed("retail", inkProd)).toBe(1.5);
    expect(lfInkMarkupMultiplierUsed("dealer", inkProd)).toBe(2.25);
  });
});

describe("computeLfInkSellPriceMdl", () => {
  it("returns 0 when multiplier or ink COGS is not positive", () => {
    expect(
      computeLfInkSellPriceMdl(10, "retail", {
        lfInkRetailMarkupMultiplier: 0,
        lfInkDealerMarkupMultiplier: 2,
      }),
    ).toBe(0);
    expect(
      computeLfInkSellPriceMdl(0, "retail", {
        lfInkRetailMarkupMultiplier: 2,
        lfInkDealerMarkupMultiplier: 0,
      }),
    ).toBe(0);
  });

  it("rounds ink COGS × multiplier", () => {
    expect(computeLfInkSellPriceMdl(33.333, "retail", inkProd)).toBe(50);
    expect(computeLfInkSellPriceMdl(44, "dealer", inkProd)).toBe(99);
  });
});

describe("mergeLfPricingWithInkSell", () => {
  it("puts ink revenue into printSellPrice and updates total / estimatedProfit", () => {
    const material = {
      calculatedLinearMeters: 5,
      materialCost: 100,
      materialSellPrice: 200,
      printSellPrice: 0,
      totalSellPrice: 200,
      estimatedProfit: 100,
    };
    expect(mergeLfPricingWithInkSell(material, 30)).toEqual({
      ...material,
      printSellPrice: 30,
      totalSellPrice: 230,
      estimatedProfit: 130,
    });
  });
});

describe("LF roll economics with ink revenue margin", () => {
  it("updates marginPercent when total line revenue includes ink sell", () => {
    const base = computeLfRollOrderEconomics({
      printWidthCm: 50,
      printHeightCm: 50,
      quantity: 1,
      calculatedLinearMeters: 1,
      rollWidthMeters: 1.37,
      effectiveMaterialCostPerLinearMeterMdl: 120,
      inkMlPerSqm: 8,
      avgInkCostPerMlMdl: 0.42,
      totalSellPriceMdl: 450,
    });
    expect(base.marginPercent).toBe(73.11);

    const fullRevenueMdl = 450 + 25;
    const full = lfRollEconomicsWithRevenueMargin(base, fullRevenueMdl);
    expect(full.marginPercent).toBeGreaterThan(base.marginPercent);
    expect(full.totalDirectCostMdl).toBe(base.totalDirectCostMdl);
  });
});
