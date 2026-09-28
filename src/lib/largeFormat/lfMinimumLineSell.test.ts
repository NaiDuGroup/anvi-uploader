import { describe, expect, it } from "vitest";
import {
  applyLfMinimumLineSellTotalMdl,
  applyGroupMinimumSellTotal,
} from "./lfMinimumLineSell";

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

describe("applyGroupMinimumSellTotal", () => {
  const line = (sell: number, ink = 0, cost = 5) => ({
    calculatedLinearMeters: 0.2,
    materialCost: cost,
    materialSellPrice: sell,
    printSellPrice: ink,
    totalSellPrice: sell + ink,
    estimatedProfit: sell + ink - cost,
  });

  it("returns unchanged when minimum is 0", () => {
    const pricings = [line(20), line(30)];
    const r = applyGroupMinimumSellTotal(pricings, 0);
    expect(r.totalUpliftMdl).toBe(0);
    expect(r.pricings[0]!.totalSellPrice).toBe(20);
    expect(r.pricings[1]!.totalSellPrice).toBe(30);
  });

  it("returns unchanged when group sum meets minimum", () => {
    const pricings = [line(60), line(50)];
    const r = applyGroupMinimumSellTotal(pricings, 100);
    expect(r.totalUpliftMdl).toBe(0);
  });

  it("distributes uplift proportionally when sum is below minimum", () => {
    const pricings = [line(20), line(30)];
    const r = applyGroupMinimumSellTotal(pricings, 100);
    expect(r.totalUpliftMdl).toBe(50);
    const sumTotal = r.pricings.reduce((s, p) => s + p.totalSellPrice, 0);
    expect(sumTotal).toBe(100);
  });

  it("distributes equally when all original prices are 0", () => {
    const pricings = [line(0), line(0)];
    const r = applyGroupMinimumSellTotal(pricings, 100);
    expect(r.totalUpliftMdl).toBe(100);
    expect(r.pricings[0]!.materialSellPrice).toBe(50);
    expect(r.pricings[1]!.materialSellPrice).toBe(50);
  });

  it("preserves ink sell prices", () => {
    const pricings = [line(10, 5), line(15, 5)];
    const r = applyGroupMinimumSellTotal(pricings, 100);
    expect(r.pricings[0]!.printSellPrice).toBe(5);
    expect(r.pricings[1]!.printSellPrice).toBe(5);
    const sumTotal = r.pricings.reduce((s, p) => s + p.totalSellPrice, 0);
    expect(sumTotal).toBe(100);
  });

  it("single line behaves like per-line minimum", () => {
    const pricings = [line(20)];
    const r = applyGroupMinimumSellTotal(pricings, 100);
    expect(r.totalUpliftMdl).toBe(80);
    expect(r.pricings[0]!.totalSellPrice).toBe(100);
  });
});
