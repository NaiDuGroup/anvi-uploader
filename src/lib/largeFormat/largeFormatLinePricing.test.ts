import { describe, expect, it } from "vitest";
import {
  computeLargeFormatLinePricing,
  effectiveLfSellRatePerLinearMeterMdl,
  roundMoneyMdl,
} from "./largeFormatLinePricing";

describe("roundMoneyMdl", () => {
  it("rounds to integer MDL", () => {
    expect(roundMoneyMdl(12.4)).toBe(12);
    expect(roundMoneyMdl(12.6)).toBe(13);
  });
  it("clamps negative to 0", () => {
    expect(roundMoneyMdl(-1)).toBe(0);
  });
});

describe("effectiveLfSellRatePerLinearMeterMdl", () => {
  it("prefers unified final rates when positive", () => {
    expect(
      effectiveLfSellRatePerLinearMeterMdl("retail", {
        costPerLinearMeter: 0,
        finalRetailPricePerLinearMeter: 220,
        finalDealerPricePerLinearMeter: 150,
        dealerPricePerLinearMeter: 1,
        retailPricePerLinearMeter: 2,
        dealerPrintPricePerLinearMeter: 3,
        retailPrintPricePerLinearMeter: 4,
      }),
    ).toBe(220);
    expect(
      effectiveLfSellRatePerLinearMeterMdl("dealer", {
        costPerLinearMeter: 0,
        finalRetailPricePerLinearMeter: 220,
        finalDealerPricePerLinearMeter: 150,
        dealerPricePerLinearMeter: 1,
        retailPricePerLinearMeter: 2,
        dealerPrintPricePerLinearMeter: 3,
        retailPrintPricePerLinearMeter: 4,
      }),
    ).toBe(150);
  });

  it("falls back to legacy material+print sum when finals are 0", () => {
    expect(
      effectiveLfSellRatePerLinearMeterMdl("retail", {
        costPerLinearMeter: 10,
        finalRetailPricePerLinearMeter: 0,
        finalDealerPricePerLinearMeter: 0,
        dealerPricePerLinearMeter: 20,
        retailPricePerLinearMeter: 30,
        dealerPrintPricePerLinearMeter: 5,
        retailPrintPricePerLinearMeter: 8,
      }),
    ).toBe(38);
  });
});

describe("computeLargeFormatLinePricing", () => {
  const materialUnified = {
    costPerLinearMeter: 10,
    finalRetailPricePerLinearMeter: 38,
    finalDealerPricePerLinearMeter: 25,
    dealerPricePerLinearMeter: 20,
    retailPricePerLinearMeter: 30,
    dealerPrintPricePerLinearMeter: 5,
    retailPrintPricePerLinearMeter: 8,
  };

  it("uses unified rate for retail pricing", () => {
    const r = computeLargeFormatLinePricing({
      calculatedLinearMeters: 2,
      customerType: "retail",
      material: materialUnified,
    });
    expect(r.calculatedLinearMeters).toBe(2);
    expect(r.materialCost).toBe(20);
    expect(r.materialSellPrice).toBe(76);
    expect(r.printSellPrice).toBe(0);
    expect(r.totalSellPrice).toBe(76);
    expect(r.estimatedProfit).toBe(56);
  });

  it("uses unified dealer rate", () => {
    const r = computeLargeFormatLinePricing({
      calculatedLinearMeters: 0.5,
      customerType: "dealer",
      material: materialUnified,
    });
    expect(r.materialCost).toBe(5);
    expect(r.totalSellPrice).toBe(13);
    expect(r.printSellPrice).toBe(0);
    expect(r.estimatedProfit).toBe(8);
  });
});
