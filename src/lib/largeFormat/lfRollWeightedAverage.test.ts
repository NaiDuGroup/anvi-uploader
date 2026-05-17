import { describe, expect, it } from "vitest";
import { weightedAverageCostPerLinearMeter } from "@/lib/largeFormat/lfRollWeightedAverage";

describe("weightedAverageCostPerLinearMeter", () => {
  it("first purchase onto empty stock uses purchase rate", () => {
    const r = weightedAverageCostPerLinearMeter({
      currentStockLinearMeters: 0,
      currentAvgPerLinearMeter: null,
      legacyCatalogCostPerLm: 300,
      purchasedLinearMeters: 50,
      purchaseTotalCostMdl: 16_500,
    });
    expect(r.newStockLinearMeters).toBe(50);
    expect(r.newAvgPerLinearMeter).toBe(330);
  });

  it("blends existing stock with new lot", () => {
    const r = weightedAverageCostPerLinearMeter({
      currentStockLinearMeters: 100,
      currentAvgPerLinearMeter: 300,
      legacyCatalogCostPerLm: 300,
      purchasedLinearMeters: 50,
      purchaseTotalCostMdl: 16_500,
    });
    expect(r.newStockLinearMeters).toBe(150);
    expect(r.newAvgPerLinearMeter).toBeCloseTo(310, 5);
  });
});
