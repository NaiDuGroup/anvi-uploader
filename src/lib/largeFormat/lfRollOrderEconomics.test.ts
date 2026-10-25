import { describe, expect, it } from "vitest";
import {
  computeLfRollOrderEconomics,
  effectiveLfMaterialCostPerLinearMeterMdl,
} from "@/lib/largeFormat/lfRollOrderEconomics";

describe("computeLfRollOrderEconomics", () => {
  it("computes areas, ink, and margin", () => {
    const r = computeLfRollOrderEconomics({
      printWidthCm: 100,
      printHeightCm: 100,
      quantity: 2,
      calculatedLinearMeters: 3,
      rollWidthMeters: 1.52,
      effectiveMaterialCostPerLinearMeterMdl: 300,
      inkMlPerSqm: 20,
      avgInkCostPerMlMdl: 0.5,
      totalSellPriceMdl: 5000,
    });
    expect(r.usefulAreaSqm).toBe(2);
    expect(r.writtenOffAreaSqm).toBeCloseTo(4.56, 5);
    expect(r.inkMlUsed).toBe(40);
    expect(r.materialPurchaseCostMdl).toBe(900);
    expect(r.inkCostMdl).toBe(20);
    expect(r.totalDirectCostMdl).toBe(920);
    expect(r.marginPercent).toBeGreaterThan(0);
  });

  it("reserves at least 1 MDL ink COGS when fractional cost would round down to zero", () => {
    const r = computeLfRollOrderEconomics({
      printWidthCm: 10,
      printHeightCm: 10,
      quantity: 1,
      calculatedLinearMeters: 0.1,
      rollWidthMeters: 1.37,
      effectiveMaterialCostPerLinearMeterMdl: 400,
      inkMlPerSqm: 30,
      avgInkCostPerMlMdl: 0.42,
      totalSellPriceMdl: 100,
    });
    expect(r.inkMlUsed).toBeCloseTo(0.3, 10);
    expect(Math.round(r.inkMlUsed * 0.42)).toBe(0);
    expect(r.inkCostMdl).toBe(1);
  });
});

describe("effectiveLfMaterialCostPerLinearMeterMdl", () => {
  it("uses the variant cost hint when there is no average yet", () => {
    expect(effectiveLfMaterialCostPerLinearMeterMdl({ catalogCostPerLm: 40, avgCostPerLm: null })).toBe(40);
  });

  it("uses the weighted average when valid", () => {
    expect(effectiveLfMaterialCostPerLinearMeterMdl({ catalogCostPerLm: 40, avgCostPerLm: 55.25 })).toBe(55.25);
  });

  it("treats an average of 0 as a real cost (same as the legacy columns)", () => {
    expect(effectiveLfMaterialCostPerLinearMeterMdl({ catalogCostPerLm: 40, avgCostPerLm: 0 })).toBe(0);
  });

  it("falls back when avg is NaN or negative", () => {
    expect(effectiveLfMaterialCostPerLinearMeterMdl({ catalogCostPerLm: 40, avgCostPerLm: Number.NaN })).toBe(40);
    expect(effectiveLfMaterialCostPerLinearMeterMdl({ catalogCostPerLm: 40, avgCostPerLm: -1 })).toBe(40);
  });
});
