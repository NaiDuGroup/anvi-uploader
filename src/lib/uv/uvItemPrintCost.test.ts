import { describe, expect, it } from "vitest";
import { uvItemPrintCostPerPieceMdl, uvPrintCostPerPieceByVariant } from "./uvItemPrintCost";
import { INK_COSTS, PEN, SETTINGS } from "./uvTestFixtures";

describe("uvItemPrintCostPerPieceMdl", () => {
  it("ink, underbase, varnish and primer of one piece from the item's print area and norms", () => {
    const notebook = { printArea: { widthCm: 14.5, heightCm: 21 }, printNorms: { whiteLayers: 1, varnish: true, primer: true } };
    // 0.03045 m²: CMYK 10 × 1.15 × 2 + white 12 × 1.15 × 3 + varnish 12 × 1.15 × 4 + primer 10 × 5.
    const area = 0.03045;
    const expected = area * (10 * 1.15 * 2 + 12 * 1.15 * 3 + 12 * 1.15 * 4 + 10 * 5);
    expect(uvItemPrintCostPerPieceMdl(notebook, SETTINGS, INK_COSTS)).toBeCloseTo(expected, 2);
  });

  it("is 0 without a print area; maps every catalog item by variant id", () => {
    expect(uvItemPrintCostPerPieceMdl({ ...PEN, printArea: null }, SETTINGS, INK_COSTS)).toBe(0);
    const map = uvPrintCostPerPieceByVariant([PEN], SETTINGS, INK_COSTS);
    expect(map.get(PEN.id)).toBeGreaterThan(0);
  });
});
