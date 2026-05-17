import { describe, expect, it } from "vitest";
import { applyLfMinimumLineSellTotalMdl } from "./lfMinimumLineSell";

describe("applyLfMinimumLineSellTotalMdl", () => {
  const base = {
    calculatedLinearMeters: 0.2,
    materialCost: 5,
    materialSellPrice: 12,
    printSellPrice: 0,
    totalSellPrice: 12,
    estimatedProfit: 7,
  };

  it("returns unchanged when minimum is 0", () => {
    const r = applyLfMinimumLineSellTotalMdl(base, 0);
    expect(r.upliftMdl).toBe(0);
    expect(r.pricing).toEqual(base);
  });

  it("returns unchanged when computed total already meets minimum", () => {
    const r = applyLfMinimumLineSellTotalMdl(base, 10);
    expect(r.upliftMdl).toBe(0);
    expect(r.pricing.totalSellPrice).toBe(12);
  });

  it("adds uplift to material sell and total", () => {
    const r = applyLfMinimumLineSellTotalMdl(base, 250);
    expect(r.upliftMdl).toBe(238);
    expect(r.pricing.materialSellPrice).toBe(250);
    expect(r.pricing.printSellPrice).toBe(0);
    expect(r.pricing.totalSellPrice).toBe(250);
  });

  it("preserves ink sell when boosting material sell", () => {
    const withInk = { ...base, printSellPrice: 8, totalSellPrice: 20 };
    const r = applyLfMinimumLineSellTotalMdl(withInk, 50);
    expect(r.pricing.totalSellPrice).toBe(50);
    expect(r.pricing.printSellPrice).toBe(8);
    expect(r.pricing.materialSellPrice).toBe(42);
    expect(r.upliftMdl).toBe(30);
  });
});
