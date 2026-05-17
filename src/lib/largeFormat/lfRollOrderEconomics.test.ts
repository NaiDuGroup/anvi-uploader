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
  it("uses legacy cost when avg is null", () => {
    expect(
      effectiveLfMaterialCostPerLinearMeterMdl({
        costPerLinearMeter: 40,
        avgPurchaseCostPerLinearMeter: null,
      }),
    ).toBe(40);
  });

  it("uses numeric avg when valid", () => {
    expect(
      effectiveLfMaterialCostPerLinearMeterMdl({
        costPerLinearMeter: 40,
        avgPurchaseCostPerLinearMeter: 55.25,
      }),
    ).toBe(55.25);
  });

  it("uses Decimal-like objects with toNumber()", () => {
    expect(
      effectiveLfMaterialCostPerLinearMeterMdl({
        costPerLinearMeter: 40,
        avgPurchaseCostPerLinearMeter: { toNumber: () => 88.125 },
      }),
    ).toBe(88.125);
  });

  it("falls back when avg is NaN or negative", () => {
    expect(
      effectiveLfMaterialCostPerLinearMeterMdl({
        costPerLinearMeter: 40,
        avgPurchaseCostPerLinearMeter: Number.NaN,
      }),
    ).toBe(40);
    expect(
      effectiveLfMaterialCostPerLinearMeterMdl({
        costPerLinearMeter: 40,
        avgPurchaseCostPerLinearMeter: -1,
      }),
    ).toBe(40);
  });
});
