import { describe, expect, it } from "vitest";
import {
  NOTEBOOK_BATCH_COLS,
  NOTEBOOK_BATCH_MAX_FILES,
  NOTEBOOK_BATCH_MIN_FILES,
  NOTEBOOK_GAP_H_CM,
  NOTEBOOK_GAP_V_CM,
  computeNotebookBatchGrid,
} from "./composeNotebookBatchPng";
import { cmToPx, pxToCm } from "@/lib/printDimensions";

/**
 * A5 hardcover default at 300 DPI (see NotebookProduct.printWidth/Height).
 * 14 cm × 21.4 cm → 1654 × 2528 px.
 */
const SLOT_W = 1654;
const SLOT_H = 2528;
// Asymmetric gaps: short-side (columns) 0.5 cm, long-side (rows) 1 cm.
const GAP_H_300 = cmToPx(NOTEBOOK_GAP_H_CM, 300); // 59
const GAP_V_300 = cmToPx(NOTEBOOK_GAP_V_CM, 300); // 118

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
  it("2 tiles → 1 row, 2 columns (gapV irrelevant, only gapH shows up)", () => {
    const grid = computeNotebookBatchGrid({
      count: 2,
      slotWidthPx: SLOT_W,
      slotHeightPx: SLOT_H,
      gapHPx: GAP_H_300,
      gapVPx: GAP_V_300,
    });
    expect(grid.cols).toBe(2);
    expect(grid.rows).toBe(1);
    expect(grid.canvasWidthPx).toBe(2 * SLOT_W + 1 * GAP_H_300);
    // Only one row → vertical gap doesn't contribute to canvas height.
    expect(grid.canvasHeightPx).toBe(SLOT_H);
    expect(grid.slots).toHaveLength(2);
    expect(grid.slots[0]).toMatchObject({ row: 0, col: 0, offsetXPx: 0, offsetYPx: 0 });
    expect(grid.slots[1]).toMatchObject({
      row: 0,
      col: 1,
      offsetXPx: SLOT_W + GAP_H_300,
      offsetYPx: 0,
    });
  });

  it("4 tiles → 1 full row, 4 columns", () => {
    const grid = computeNotebookBatchGrid({
      count: 4,
      slotWidthPx: SLOT_W,
      slotHeightPx: SLOT_H,
      gapHPx: GAP_H_300,
      gapVPx: GAP_V_300,
    });
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(1);
    expect(grid.canvasWidthPx).toBe(4 * SLOT_W + 3 * GAP_H_300);
    expect(grid.canvasHeightPx).toBe(SLOT_H);
    expect(grid.slots.map((s) => s.col)).toEqual([0, 1, 2, 3]);
    expect(grid.slots.map((s) => s.row)).toEqual([0, 0, 0, 0]);
  });
});

describe("computeNotebookBatchGrid: two rows", () => {
  it("5 tiles → row 1 full (4 cols), row 2 has 1 tile — asymmetric gaps", () => {
    const grid = computeNotebookBatchGrid({
      count: 5,
      slotWidthPx: SLOT_W,
      slotHeightPx: SLOT_H,
      gapHPx: GAP_H_300,
      gapVPx: GAP_V_300,
    });
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(2);
    expect(grid.canvasWidthPx).toBe(4 * SLOT_W + 3 * GAP_H_300);
    expect(grid.canvasHeightPx).toBe(2 * SLOT_H + 1 * GAP_V_300);
    // Row-major: slot #4 wraps to (row=1, col=0), with vertical gap = 1 cm.
    expect(grid.slots[4]).toMatchObject({
      row: 1,
      col: 0,
      offsetXPx: 0,
      offsetYPx: SLOT_H + GAP_V_300,
    });
  });

  it("8 tiles → full 4×2, physical size ≈ 57.5 × 43.8 cm at 300 DPI", () => {
    const grid = computeNotebookBatchGrid({
      count: 8,
      slotWidthPx: SLOT_W,
      slotHeightPx: SLOT_H,
      gapHPx: GAP_H_300,
      gapVPx: GAP_V_300,
    });
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(2);
    // 4·1654 + 3·59 = 6793 px (0.5 cm horizontal gap)
    expect(grid.canvasWidthPx).toBe(6793);
    // 2·2528 + 1·118 = 5174 px (1 cm vertical gap for UV head clearance)
    expect(grid.canvasHeightPx).toBe(5174);
    // Sanity: physical dimensions at 300 DPI.
    expect(pxToCm(grid.canvasWidthPx, 300)).toBeCloseTo(57.5, 1);
    expect(pxToCm(grid.canvasHeightPx, 300)).toBeCloseTo(43.8, 1);
    // Last slot sits at bottom-right of the grid.
    expect(grid.slots[7]).toMatchObject({
      row: 1,
      col: 3,
      offsetXPx: 3 * (SLOT_W + GAP_H_300),
      offsetYPx: SLOT_H + GAP_V_300,
    });
  });
});

describe("computeNotebookBatchGrid: DPI scaling of the notebook gaps", () => {
  it("horizontal 0.5 cm → 30 px @ 150 DPI (round-trip ≈0.5 cm)", () => {
    const gapH150 = cmToPx(NOTEBOOK_GAP_H_CM, 150); // round(0.5*150/2.54) = 30
    expect(gapH150).toBe(30);
    // Physical gap stays ≈0.5 cm regardless of DPI. Precision loosened to 1
    // decimal because 30 px @ 150 DPI back-converts to 0.508 cm — inherent
    // to integer-pixel gaps at low DPI (UV printer positional accuracy is
    // ±0.1 mm at best, so this is irrelevant in practice).
    expect(pxToCm(gapH150, 150)).toBeCloseTo(0.5, 1);
  });

  it("vertical 1 cm → 59 px @ 150 DPI (round-trip ≈1.0 cm)", () => {
    const gapV150 = cmToPx(NOTEBOOK_GAP_V_CM, 150); // round(1.0*150/2.54) = 59
    expect(gapV150).toBe(59);
    // 1 cm round-trips more cleanly than 0.5 cm (0.999 vs 0.508).
    expect(pxToCm(gapV150, 150)).toBeCloseTo(1.0, 2);
  });

  it("applies asymmetric gaps in a 2-tile row @ 150 DPI", () => {
    const gapH150 = 30;
    const gapV150 = 59;
    const grid = computeNotebookBatchGrid({
      count: 2,
      slotWidthPx: 827, // A5 width @ 150 DPI
      slotHeightPx: 1264,
      gapHPx: gapH150,
      gapVPx: gapV150,
    });
    // Only one row → vertical gap doesn't contribute.
    expect(grid.canvasWidthPx).toBe(2 * 827 + 1 * 30);
    expect(grid.canvasHeightPx).toBe(1264);
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
