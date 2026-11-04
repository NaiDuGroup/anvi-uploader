import { describe, expect, it } from "vitest";
import { cappedTierTotal, tierPriceForQuantity, type GarmentPriceTier } from "./garmentPriceTiers";

/** Approved pen run-size prices (2026-11). */
const PEN_TIERS: GarmentPriceTier[] = [
  { minQty: 1, priceMdl: 100 },
  { minQty: 2, priceMdl: 80 },
  { minQty: 5, priceMdl: 60 },
  { minQty: 10, priceMdl: 45 },
  { minQty: 25, priceMdl: 35 },
  { minQty: 50, priceMdl: 28 },
  { minQty: 100, priceMdl: 22 },
  { minQty: 300, priceMdl: 20 },
];

const total = (q: number): number => cappedTierTotal(PEN_TIERS, q, tierPriceForQuantity(PEN_TIERS, q)!.priceMdl);

describe("cappedTierTotal", () => {
  it.each([
    [1, 100],
    [2, 160],
    [4, 300], // 320 capped by 5 × 60
    [5, 300],
    [9, 450], // 540 capped by 10 × 45
    [10, 450],
    [24, 875], // 1080 capped by 25 × 35
    [25, 875],
    [49, 1400], // 1715 capped by 50 × 28
    [50, 1400],
    [99, 2200], // 2772 capped by 100 × 22
    [100, 2200],
    [300, 6000],
  ])("%i pens cost %i lei", (q, expected) => {
    expect(total(q)).toBe(expected);
  });

  it("a bigger run never costs less than a smaller one", () => {
    for (let q = 1; q < 400; q++) expect(total(q + 1)).toBeGreaterThanOrEqual(total(q));
  });

  it("no higher tier: plain quantity × unit", () => {
    expect(cappedTierTotal([{ minQty: 1, priceMdl: 12.5 }], 3, 12.5)).toBe(37.5);
  });
});
