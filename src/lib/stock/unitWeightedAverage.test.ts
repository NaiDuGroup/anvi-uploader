import { describe, it, expect } from "vitest";
import { weightedAverageUnitCost } from "./unitWeightedAverage";
import { effectiveUnitCost, stockValueMdl } from "./effectiveUnitCost";

describe("weightedAverageUnitCost", () => {
  it("first receipt on empty stock takes the purchase rate", () => {
    const r = weightedAverageUnitCost({
      currentStock: 0,
      currentAvgCost: null,
      catalogCost: 30,
      purchasedQty: 100,
      purchaseTotalMdl: 2500,
    });
    expect(r).toEqual({ newAvgCost: 25, newStock: 100, purchaseUnitCost: 25 });
  });

  it("blends existing stock at the catalog cost before the first receipt", () => {
    const r = weightedAverageUnitCost({
      currentStock: 50,
      currentAvgCost: null,
      catalogCost: 20,
      purchasedQty: 50,
      purchaseTotalMdl: 1500,
    });
    expect(r.newAvgCost).toBe(25);
    expect(r.newStock).toBe(100);
  });

  it("blends with the previous weighted average", () => {
    const r = weightedAverageUnitCost({
      currentStock: 30,
      currentAvgCost: 40,
      catalogCost: 10,
      purchasedQty: 10,
      purchaseTotalMdl: 600,
    });
    expect(r.newAvgCost).toBe(45);
    expect(r.purchaseUnitCost).toBe(60);
  });

  it("uses the purchase rate when there is stock but no prior cost at all", () => {
    const r = weightedAverageUnitCost({
      currentStock: 10,
      currentAvgCost: null,
      catalogCost: null,
      purchasedQty: 10,
      purchaseTotalMdl: 100,
    });
    expect(r.newAvgCost).toBe(10);
    expect(r.newStock).toBe(20);
  });

  it("rejects a non-positive quantity or negative total", () => {
    const base = { currentStock: 0, currentAvgCost: null, catalogCost: null };
    expect(() =>
      weightedAverageUnitCost({ ...base, purchasedQty: 0, purchaseTotalMdl: 10 }),
    ).toThrow();
    expect(() =>
      weightedAverageUnitCost({ ...base, purchasedQty: 1, purchaseTotalMdl: -1 }),
    ).toThrow();
  });
});

describe("effectiveUnitCost", () => {
  it("prefers the weighted average and rounds to bani", () => {
    expect(effectiveUnitCost(12.34567, 99)).toBe(12.35);
  });

  it("falls back to the catalog cost, then null", () => {
    expect(effectiveUnitCost(null, 18.5)).toBe(18.5);
    expect(effectiveUnitCost(null, null)).toBeNull();
  });

  it("stockValueMdl multiplies by quantity", () => {
    expect(stockValueMdl(3, 10.25, null)).toBe(30.75);
    expect(stockValueMdl(3, null, null)).toBeNull();
  });
});
