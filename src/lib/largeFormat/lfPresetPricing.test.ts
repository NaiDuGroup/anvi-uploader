import { describe, expect, it } from "vitest";
import {
  applyLfSizePresetOverride,
  selectLfSizePresetPriceMdl,
} from "./lfPresetPricing";

describe("selectLfSizePresetPriceMdl", () => {
  it("returns retail price for retail customers", () => {
    expect(
      selectLfSizePresetPriceMdl({ retailPriceMdl: 310, dealerPriceMdl: 230 }, "retail"),
    ).toBe(310);
  });
  it("returns dealer price for dealer customers", () => {
    expect(
      selectLfSizePresetPriceMdl({ retailPriceMdl: 310, dealerPriceMdl: 230 }, "dealer"),
    ).toBe(230);
  });
});

describe("applyLfSizePresetOverride", () => {
  const basePricing = {
    calculatedLinearMeters: 0.4,
    materialCost: 17,
    materialSellPrice: 38,
    printSellPrice: 0,
    totalSellPrice: 38,
    estimatedProfit: 21,
  };

  it("replaces total with preset × quantity (single piece)", () => {
    const out = applyLfSizePresetOverride({
      pricing: basePricing,
      presetPriceMdl: 310,
      quantity: 1,
    });
    expect(out.totalSellPrice).toBe(310);
    expect(out.materialSellPrice).toBe(310);
    expect(out.printSellPrice).toBe(0);
  });

  it("multiplies preset price by quantity", () => {
    const out = applyLfSizePresetOverride({
      pricing: basePricing,
      presetPriceMdl: 310,
      quantity: 3,
    });
    expect(out.totalSellPrice).toBe(930);
    expect(out.materialSellPrice).toBe(930);
  });

  it("keeps materialCost untouched (COGS for profit)", () => {
    const out = applyLfSizePresetOverride({
      pricing: basePricing,
      presetPriceMdl: 310,
      quantity: 2,
    });
    expect(out.materialCost).toBe(17);
    expect(out.calculatedLinearMeters).toBe(0.4);
  });

  it("subtracts ink COGS from profit when provided", () => {
    const out = applyLfSizePresetOverride({
      pricing: basePricing,
      presetPriceMdl: 310,
      quantity: 1,
      inkCostMdl: 12,
    });
    /** 310 sell − 17 material − 12 ink = 281. */
    expect(out.estimatedProfit).toBe(281);
  });

  it("never adds ink markup to printSellPrice (preset wins)", () => {
    const pricingWithInk = {
      ...basePricing,
      printSellPrice: 50,
      totalSellPrice: 88,
    };
    const out = applyLfSizePresetOverride({
      pricing: pricingWithInk,
      presetPriceMdl: 200,
      quantity: 1,
    });
    expect(out.printSellPrice).toBe(0);
    expect(out.totalSellPrice).toBe(200);
  });

  it("clamps negative quantity to 0 (defensive)", () => {
    const out = applyLfSizePresetOverride({
      pricing: basePricing,
      presetPriceMdl: 310,
      quantity: -5,
    });
    expect(out.totalSellPrice).toBe(0);
    expect(out.materialSellPrice).toBe(0);
  });

  it("clamps negative preset price to 0", () => {
    const out = applyLfSizePresetOverride({
      pricing: basePricing,
      presetPriceMdl: -100,
      quantity: 2,
    });
    expect(out.totalSellPrice).toBe(0);
  });

  it("rounds preset price to integer MDL", () => {
    const out = applyLfSizePresetOverride({
      pricing: basePricing,
      presetPriceMdl: 309.7,
      quantity: 1,
    });
    expect(out.totalSellPrice).toBe(310);
  });
});
