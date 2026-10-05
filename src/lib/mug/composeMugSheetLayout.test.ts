import { describe, expect, it } from "vitest";
import { pxToCm } from "@/lib/printDimensions";
import {
  MUG_SHEET_DPI,
  buildMugSheetFileName,
  computeMugSheetLayout,
  mugDesignPx,
} from "./composeMugSheetPng";

/**
 * Golden numbers for the A4 sublimation sheet at 300 DPI. These are the
 * coordinates the workshop trims against, so they are pinned explicitly
 * rather than recomputed from the constants.
 */
describe("computeMugSheetLayout", () => {
  it("builds a 2480 x 3508 px A4 sheet at 300 DPI", () => {
    const layout = computeMugSheetLayout({ count: 2 });
    expect(layout.dpi).toBe(MUG_SHEET_DPI);
    expect(layout.sheetWidthPx).toBe(2480);
    expect(layout.sheetHeightPx).toBe(3508);
    expect(pxToCm(layout.sheetWidthPx, 300)).toBeCloseTo(21.0, 1);
    expect(pxToCm(layout.sheetHeightPx, 300)).toBeCloseTo(29.7, 1);
  });

  it("places two 24 x 9.8 cm cut boxes side by side with a 0.2 cm gap", () => {
    const layout = computeMugSheetLayout({ count: 2 });
    const [left, right] = layout.slots;

    expect(layout.slots).toHaveLength(2);
    expect(layout.gapPx).toBe(24);

    // Rotated 90°: 9.8 cm across, 24 cm down.
    for (const slot of layout.slots) {
      expect(slot.cutWidthPx).toBe(1157);
      expect(slot.cutHeightPx).toBe(2835);
      expect(pxToCm(slot.cutWidthPx, 300)).toBeCloseTo(9.8, 1);
      expect(pxToCm(slot.cutHeightPx, 300)).toBeCloseTo(24.0, 1);
    }

    expect(left!.cutXPx).toBe(71);
    expect(right!.cutXPx).toBe(1252);
    expect(right!.cutXPx - (left!.cutXPx + left!.cutWidthPx)).toBe(24);
    expect(left!.cutYPx).toBe(336);
    expect(right!.cutYPx).toBe(336);
  });

  it("centres the pair on the sheet", () => {
    const layout = computeMugSheetLayout({ count: 2 });
    const right = layout.slots[1]!;

    expect(layout.marginXPx).toBe(71);
    expect(layout.marginYPx).toBe(336);
    // Right margin may absorb one extra pixel from the floor division.
    const rightMargin =
      layout.sheetWidthPx - (right.cutXPx + right.cutWidthPx);
    expect(rightMargin).toBe(71);
    const bottomMargin =
      layout.sheetHeightPx - (right.cutYPx + right.cutHeightPx);
    expect(bottomMargin).toBe(337);
  });

  it("centres the 21 x 9.6 cm design inside its cut box", () => {
    const layout = computeMugSheetLayout({ count: 2 });
    for (const slot of layout.slots) {
      expect(slot.designWidthPx).toBe(1134);
      expect(slot.designHeightPx).toBe(2480);
      expect(slot.designXPx - slot.cutXPx).toBe(11);
      expect(slot.designYPx - slot.cutYPx).toBe(177);
      expect(pxToCm(slot.designWidthPx, 300)).toBeCloseTo(9.6, 1);
      expect(pxToCm(slot.designHeightPx, 300)).toBeCloseTo(21.0, 1);
    }
  });

  it("right-aligns the tail sheet's single box on the slot 1 coordinates", () => {
    const full = computeMugSheetLayout({ count: 2 });
    const tail = computeMugSheetLayout({ count: 1 });

    expect(tail.slots).toHaveLength(1);
    expect(tail.marginXPx).toBe(full.marginXPx);
    expect(tail.slots[0]).toEqual(full.slots[1]);
    expect(tail.slots[0]!.index).toBe(1);
    expect(tail.slots[0]!.cutXPx).toBe(1252);

    const rightMargin =
      tail.sheetWidthPx - (tail.slots[0]!.cutXPx + tail.slots[0]!.cutWidthPx);
    const leftMargin = tail.slots[0]!.cutXPx;
    expect(rightMargin).toBe(71);
    expect(leftMargin).toBeGreaterThan(rightMargin);
  });

  it("rejects counts outside 1-2 and non-integers", () => {
    expect(() => computeMugSheetLayout({ count: 0 })).toThrow(/between 1 and 2/);
    expect(() => computeMugSheetLayout({ count: 3 })).toThrow(/between 1 and 2/);
    expect(() => computeMugSheetLayout({ count: 1.5 })).toThrow(/integer/);
  });

  it("scales with DPI", () => {
    const layout = computeMugSheetLayout({ count: 2, dpi: 600 });
    expect(layout.sheetWidthPx).toBe(4961);
    expect(layout.sheetHeightPx).toBe(7016);
    expect(layout.gapPx).toBe(47);
    expect(layout.slots[0]!.cutWidthPx).toBe(2315);
  });
});

describe("mugDesignPx", () => {
  it("returns the unrotated 21 x 9.6 cm artwork size", () => {
    expect(mugDesignPx()).toEqual({ width: 2480, height: 1134 });
  });
});

describe("buildMugSheetFileName", () => {
  const date = new Date(2026, 9, 5);

  it("keys slots by order number", () => {
    expect(buildMugSheetFileName([8231, 8244], date)).toBe(
      "mug-sheet_8231_8244_20261005.png",
    );
  });

  it("falls back to the slot position when the order is unknown", () => {
    expect(buildMugSheetFileName([null, 8244], date)).toBe(
      "mug-sheet_slot1_8244_20261005.png",
    );
  });

  it("handles a single-tile tail sheet", () => {
    expect(buildMugSheetFileName([8231], date)).toBe(
      "mug-sheet_8231_20261005.png",
    );
  });
});
