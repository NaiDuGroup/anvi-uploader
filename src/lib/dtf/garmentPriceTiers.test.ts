import { describe, expect, it } from "vitest";
import { dtfVariantPriceTiers } from "./stockGarments";
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

/**
 * Pen per-piece price as the UV engine / public quote show it: the run-size
 * tier at the quantity, then (pens only) the total capped by every higher tier
 * at its minimum quantity, unit = capped total / quantity to the cent.
 * So the per-piece price is NOT the raw tier just below a boundary
 * (4 pens: tier 80, shown 75; 99 pens: tier 28, shown 22.22) — the engine
 * enforces «N+1 pens never cheaper than N» by capping, not by a list change.
 */
describe("pen per-piece price at tier boundaries", () => {
  const unit = (q: number): number => Math.round((total(q) / q) * 100) / 100;

  it.each([
    // [qty, raw tier price, per-piece after cap, line total]
    [1, 100, 100, 100],
    [2, 80, 80, 160],
    [4, 80, 75, 300], // 4 × 80 = 320 > 5 × 60 = 300 → capped
    [5, 60, 60, 300],
    [9, 60, 50, 450], // 540 > 10 × 45 = 450 → capped
    [10, 45, 45, 450],
    [24, 45, 36.46, 875], // 1080 > 25 × 35 = 875 → capped
    [25, 35, 35, 875],
    [49, 35, 28.57, 1400], // 1715 > 50 × 28 = 1400 → capped
    [50, 28, 28, 1400],
    [99, 28, 22.22, 2200], // 2772 > 100 × 22 = 2200 → capped
    [100, 22, 22, 2200],
    [299, 22, 20.07, 6000], // 6578 > 300 × 20 = 6000 → capped
    [300, 20, 20, 6000],
    [1000, 20, 20, 20000],
  ])("%i pens: tier %d, per piece %d, total %d", (q, tierPrice, perPiece, lineTotal) => {
    expect(tierPriceForQuantity(PEN_TIERS, q)!.priceMdl).toBe(tierPrice);
    expect(unit(q)).toBe(perPiece);
    expect(total(q)).toBe(lineTotal);
  });

  it("without tiers (variant.priceTiers null) sellPrice applies flat from 1 piece: 100 pens at 100 = 10 000", () => {
    // What a DB copy without pen tiers prices (local prod copy 2026-11-05).
    const flat = dtfVariantPriceTiers(null, 100);
    expect(flat).toEqual([{ minQty: 1, priceMdl: 100 }]);
    expect(cappedTierTotal(flat, 100, tierPriceForQuantity(flat, 100)!.priceMdl)).toBe(10_000);
  });
});
