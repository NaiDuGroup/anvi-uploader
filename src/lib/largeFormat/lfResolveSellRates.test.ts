import { describe, it, expect } from "vitest";
import type { ProductionCostsConfig } from "@/lib/accounting/types";
import { resolveLfSellRatesPerLinearMeterMdl } from "./lfResolveSellRates";

const baseMaterial = {
  costPerLinearMeter: 100,
  finalRetailPricePerLinearMeter: 500,
  finalDealerPricePerLinearMeter: 400,
  dealerPricePerLinearMeter: 50,
  retailPricePerLinearMeter: 60,
  dealerPrintPricePerLinearMeter: 70,
  retailPrintPricePerLinearMeter: 80,
  manualFinalRetailPricePerLinearMeter: null as number | null,
  manualFinalDealerPricePerLinearMeter: null as number | null,
};

function prod(p: Partial<ProductionCostsConfig>): ProductionCostsConfig {
  return {
    mugPrintPerUnit: 0,
    notebookPrintPerUnit: 0,
    packagingPerOrder: 0,
    otherConsumablesPerOrder: 0,
    inkMlPerSqmLargeFormatRoll: 0,
    inkMlPerSqmUvRigid: 0,
    inkMlPerSqmDtfTextile: 0,
    minimumOrderPriceMdl: 0,
    lfMinimumLineTotalMdl: 0,
    lfRetailMarkupMultiplier: 0,
    lfDealerMarkupMultiplier: 0,
    lfInkRetailMarkupMultiplier: 0,
    lfInkDealerMarkupMultiplier: 0,
    ...p,
  };
}

describe("resolveLfSellRatesPerLinearMeterMdl", () => {
  it("uses manual overrides when set", () => {
    const r = resolveLfSellRatesPerLinearMeterMdl({
      effectiveMaterialCostPerLinearMeterMdl: 10,
      production: prod({ lfRetailMarkupMultiplier: 3, lfDealerMarkupMultiplier: 2 }),
      material: {
        ...baseMaterial,
        manualFinalRetailPricePerLinearMeter: 777,
        manualFinalDealerPricePerLinearMeter: 888,
      },
    });
    expect(r).toEqual({
      finalRetailPricePerLinearMeter: 777,
      finalDealerPricePerLinearMeter: 888,
    });
  });

  it("uses markup × effective cost when multiplier > 0", () => {
    const r = resolveLfSellRatesPerLinearMeterMdl({
      effectiveMaterialCostPerLinearMeterMdl: 40,
      production: prod({ lfRetailMarkupMultiplier: 2.5, lfDealerMarkupMultiplier: 1.6 }),
      material: baseMaterial,
    });
    expect(r.finalRetailPricePerLinearMeter).toBe(Math.round(40 * 2.5));
    expect(r.finalDealerPricePerLinearMeter).toBe(Math.round(40 * 1.6));
  });

  it("falls back to legacy effective rates when multipliers are 0", () => {
    const r = resolveLfSellRatesPerLinearMeterMdl({
      effectiveMaterialCostPerLinearMeterMdl: 999,
      production: prod({}),
      material: baseMaterial,
    });
    expect(r.finalRetailPricePerLinearMeter).toBe(500);
    expect(r.finalDealerPricePerLinearMeter).toBe(400);
  });
});
