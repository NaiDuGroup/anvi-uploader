import { describe, expect, it } from "vitest";
import { buildUvLineData } from "@/lib/uv/buildUvLineData";
import { INK_COSTS, PEN, SETTINGS } from "@/lib/uv/uvTestFixtures";
import { penLineTotalMdl } from "./penLineTotal";

const PEN_2026_11 = {
  ...PEN,
  priceTiers: [
    { minQty: 1, priceMdl: 100 },
    { minQty: 2, priceMdl: 80 },
    { minQty: 5, priceMdl: 60 },
    { minQty: 10, priceMdl: 45 },
    { minQty: 25, priceMdl: 35 },
    { minQty: 50, priceMdl: 28 },
    { minQty: 100, priceMdl: 22 },
    { minQty: 300, priceMdl: 20 },
  ],
};

/** Per-piece unit as the order wizard / dealer server take it from the UV engine. */
function unit(quantity: number, customerType: "retail" | "dealer"): number {
  const d = buildUvLineData(
    { source: "stock", variantId: PEN.id, quantity, zones: [{ id: "main", placement: "front", whiteLayers: 1, varnish: false, primer: false }] },
    customerType,
    { item: PEN_2026_11, settings: SETTINGS, inkCosts: INK_COSTS },
  );
  return Math.round(d.pricing.unitItemPriceMdl * 100) / 100;
}

describe("penLineTotalMdl", () => {
  it.each([
    [24, 36.46, 875],
    [49, 28.57, 1400],
    [99, 22.22, 2200],
    [4, 75, 300],
  ])("retail %i pens: unit %d → line %i lei", (q, u, total) => {
    expect(unit(q, "retail")).toBe(u);
    expect(penLineTotalMdl(unit(q, "retail"), q)).toBe(total);
  });

  it("dealer 4 pens: 18 × 4 = 72", () => {
    expect(penLineTotalMdl(unit(4, "dealer"), 4)).toBe(72);
  });

  it("rounds a manual unit with bani to whole lei", () => {
    expect(penLineTotalMdl(12.5, 3)).toBe(38);
    expect(penLineTotalMdl(12.4, 3)).toBe(37);
  });
});
