import { describe, expect, it } from "vitest";
import { weightedAverageInkCostPerMl } from "@/lib/ink/inkWeightedAverage";

describe("weightedAverageInkCostPerMl", () => {
  it("first fill uses purchase rate", () => {
    const r = weightedAverageInkCostPerMl({
      currentStockMl: 0,
      currentAvgCostPerMl: 0,
      purchasedMl: 1000,
      purchaseTotalCostMdl: 5000,
    });
    expect(r.newStockMl).toBe(1000);
    expect(r.newAvgCostPerMl).toBe(5);
  });

  it("blends with existing stock", () => {
    const r = weightedAverageInkCostPerMl({
      currentStockMl: 2000,
      currentAvgCostPerMl: 5,
      purchasedMl: 1000,
      purchaseTotalCostMdl: 6000,
    });
    expect(r.newStockMl).toBe(3000);
    expect(r.newAvgCostPerMl).toBeCloseTo(5.333333, 4);
  });
});
