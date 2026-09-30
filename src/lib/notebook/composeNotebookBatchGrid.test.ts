import { describe, expect, it } from "vitest";
import {
  NOTEBOOK_BATCH_COLS,
  NOTEBOOK_BATCH_MAX_FILES,
  NOTEBOOK_BATCH_MIN_FILES,
  NOTEBOOK_GAP_CM,
  computeNotebookBatchGrid,
} from "./composeNotebookBatchPng";
import { cmToPx, pxToCm } from "@/lib/printDimensions";

/**
 * A5 hardcover default at 300 DPI (see NotebookProduct.printWidth/Height).
 * 14 cm × 21.4 cm → 1654 × 2528 px.
 */
const SLOT_W = 1654;
const SLOT_H = 2528;
const GAP_300 = cmToPx(NOTEBOOK_GAP_CM, 300); // 59

describe("public constants", () => {
  it("keeps the invariant MIN <= COLS <= MAX", () => {
    expect(NOTEBOOK_BATCH_MIN_FILES).toBeLessThanOrEqual(NOTEBOOK_BATCH_COLS);
    expect(NOTEBOOK_BATCH_COLS).toBeLessThanOrEqual(NOTEBOOK_BATCH_MAX_FILES);
  });

  it("exposes 8 as the current max", () => {
    // Regression guard for the 4 → 8 bump.
    expect(NOTEBOOK_BATCH_MAX_FILES).toBe(8);
    expect(NOTEBOOK_BATCH_COLS).toBe(4);
  });
});

describe("computeNotebookBatchGrid: single row", () => {
  it("2 tiles → 1 row, 2 columns", () => {
    const grid = computeNotebookBatchGrid({
      count: 2,
      slotWidthPx: SLOT_W,
      slotHeightPx: SLOT_H,
      gapHPx: GAP_300,
      gapVPx: GAP_300,
    });
    expect(grid.cols).toBe(2);
    expect(grid.rows).toBe(1);
    expect(grid.canvasWidthPx).toBe(2 * SLOT_W + 1 * GAP_300);
    expect(grid.canvasHeightPx).toBe(SLOT_H);
    expect(grid.slots).toHaveLength(2);
    expect(grid.slots[0]).toMatchObject({ row: 0, col: 0, offsetXPx: 0, offsetYPx: 0 });
    expect(grid.slots[1]).toMatchObject({
      row: 0,
      col: 1,
      offsetXPx: SLOT_W + GAP_300,
      offsetYPx: 0,
    });
  });

  it("4 tiles → 1 full row, 4 columns", () => {
    const grid = computeNotebookBatchGrid({
      count: 4,
      slotWidthPx: SLOT_W,
      slotHeightPx: SLOT_H,
      gapHPx: GAP_300,
      gapVPx: GAP_300,
    });
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(1);
    expect(grid.canvasWidthPx).toBe(4 * SLOT_W + 3 * GAP_300);
    expect(grid.canvasHeightPx).toBe(SLOT_H);
    expect(grid.slots.map((s) => s.col)).toEqual([0, 1, 2, 3]);
    expect(grid.slots.map((s) => s.row)).toEqual([0, 0, 0, 0]);
  });
});

describe("computeNotebookBatchGrid: two rows", () => {
  it("5 tiles → row 1 full (4 cols), row 2 has 1 tile", () => {
    const grid = computeNotebookBatchGrid({
      count: 5,
      slotWidthPx: SLOT_W,
      slotHeightPx: SLOT_H,
      gapHPx: GAP_300,
      gapVPx: GAP_300,
    });
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(2);
    expect(grid.canvasWidthPx).toBe(4 * SLOT_W + 3 * GAP_300);
    expect(grid.canvasHeightPx).toBe(2 * SLOT_H + 1 * GAP_300);
    // Row-major: slot #4 wraps to (row=1, col=0).
    expect(grid.slots[4]).toMatchObject({
      row: 1,
      col: 0,
      offsetXPx: 0,
      offsetYPx: SLOT_H + GAP_300,
    });
  });

  it("8 tiles → full 4×2, physical size ≈ 57.5 × 43.3 cm at 300 DPI", () => {
    const grid = computeNotebookBatchGrid({
      count: 8,
      slotWidthPx: SLOT_W,
      slotHeightPx: SLOT_H,
      gapHPx: GAP_300,
      gapVPx: GAP_300,
    });
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(2);
    // 4·1654 + 3·59 = 6793 px
    expect(grid.canvasWidthPx).toBe(6793);
    // 2·2528 + 1·59 = 5115 px
    expect(grid.canvasHeightPx).toBe(5115);
    // Sanity: physical dimensions at 300 DPI.
    expect(pxToCm(grid.canvasWidthPx, 300)).toBeCloseTo(57.5, 1);
    expect(pxToCm(grid.canvasHeightPx, 300)).toBeCloseTo(43.3, 1);
    // Last slot sits at bottom-right of the grid.
    expect(grid.slots[7]).toMatchObject({
      row: 1,
      col: 3,
      offsetXPx: 3 * (SLOT_W + GAP_300),
      offsetYPx: SLOT_H + GAP_300,
    });
  });
});

describe("computeNotebookBatchGrid: DPI scaling of the 0.5 cm gap", () => {
  it("uses smaller pixel gap at 150 DPI while preserving the physical 0.5 cm", () => {
    const gap150 = cmToPx(NOTEBOOK_GAP_CM, 150); // 30 px
    const grid = computeNotebookBatchGrid({
      count: 2,
      slotWidthPx: 827, // A5 width @ 150 DPI
      slotHeightPx: 1264,
      gapHPx: gap150,
      gapVPx: gap150,
    });
    expect(grid.canvasWidthPx).toBe(2 * 827 + 1 * 30);
    // Physical gap stays ≈0.5 cm regardless of DPI. Precision loosened to 1
    // decimal because 0.5 cm at 150 DPI rounds to 30 px and back-converts to
    // 0.508 cm — the rounding error is inherent to integer-pixel gaps at
    // low DPI (irrelevant in practice; UV printer positional accuracy is
    // ±0.1 mm at best).
    expect(pxToCm(gap150, 150)).toBeCloseTo(0.5, 1);
  });
});

describe("computeNotebookBatchGrid: validation", () => {
  it("throws when count < MIN", () => {
    expect(() =>
      computeNotebookBatchGrid({
        count: 1,
        slotWidthPx: 100,
        slotHeightPx: 100,
        gapHPx: 10,
        gapVPx: 10,
      }),
    ).toThrow(/between 2 and 8/);
  });

  it("throws when count > MAX", () => {
    expect(() =>
      computeNotebookBatchGrid({
        count: 9,
        slotWidthPx: 100,
        slotHeightPx: 100,
        gapHPx: 10,
        gapVPx: 10,
      }),
    ).toThrow(/between 2 and 8/);
  });

  it("throws for non-integer counts", () => {
    expect(() =>
      computeNotebookBatchGrid({
        count: 2.5,
        slotWidthPx: 100,
        slotHeightPx: 100,
        gapHPx: 10,
        gapVPx: 10,
      }),
    ).toThrow(/integer/);
  });

  it("throws for non-positive slot dimensions", () => {
    expect(() =>
      computeNotebookBatchGrid({
        count: 2,
        slotWidthPx: 0,
        slotHeightPx: 100,
        gapHPx: 10,
        gapVPx: 10,
      }),
    ).toThrow(/Slot dimensions/);
  });

  it("throws for negative gaps", () => {
    expect(() =>
      computeNotebookBatchGrid({
        count: 2,
        slotWidthPx: 100,
        slotHeightPx: 100,
        gapHPx: -1,
        gapVPx: 10,
      }),
    ).toThrow(/Gaps/);
  });

  it("accepts zero gaps (tight-packed like the old v1 layout)", () => {
    const grid = computeNotebookBatchGrid({
      count: 2,
      slotWidthPx: 100,
      slotHeightPx: 100,
      gapHPx: 0,
      gapVPx: 0,
    });
    expect(grid.canvasWidthPx).toBe(200);
    expect(grid.canvasHeightPx).toBe(100);
  });
});
