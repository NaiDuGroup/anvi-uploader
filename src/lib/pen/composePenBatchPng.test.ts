import { describe, expect, it } from "vitest";
import { parseNotebookColorFromFileName } from "@/lib/notebook/parseNotebookColorFromFileName";
import {
  PEN_BATCH_COLS,
  PEN_BATCH_MAX_FILES,
  PEN_BATCH_MIN_FILES,
  PEN_GAP_H_PX,
  PEN_GAP_V_PX,
  PEN_SLOT_HEIGHT_PX,
  PEN_SLOT_WIDTH_PX,
  buildPenBatchFileName,
  computePenBatchGrid,
} from "./composePenBatchPng";

const STEP_H = PEN_SLOT_WIDTH_PX + PEN_GAP_H_PX;
const STEP_V = PEN_SLOT_HEIGHT_PX + PEN_GAP_V_PX;

describe("computePenBatchGrid", () => {
  it("places 2 pens in a single row of 2 columns", () => {
    const grid = computePenBatchGrid(2);
    expect(grid.cols).toBe(2);
    expect(grid.rows).toBe(1);
    expect(grid.slots).toHaveLength(2);
    expect(grid.slots[0]).toMatchObject({ row: 0, col: 0, xPx: 0, yPx: 0 });
    expect(grid.slots[1]).toMatchObject({ row: 0, col: 1, xPx: STEP_H, yPx: 0 });
  });

  it("places 3 pens across a single full row", () => {
    const grid = computePenBatchGrid(3);
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(1);
    expect(grid.slots[2]).toMatchObject({ row: 0, col: 2, xPx: 2 * STEP_H, yPx: 0 });
  });

  it("wraps to row 2 for the 4th pen", () => {
    const grid = computePenBatchGrid(4);
    expect(grid.rows).toBe(2);
    expect(grid.slots[3]).toMatchObject({ row: 1, col: 0, xPx: 0, yPx: STEP_V });
  });

  it("matches the printer software totals for 9 pens (3x3 grid, 41.81 x 7.63 cm)", () => {
    const grid = computePenBatchGrid(9);
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(3);
    // 3 * 591 + 2 * 1583 = 4939 px = 41.81 cm at 300 DPI
    expect(grid.canvasWidthPx).toBe(4939);
    // 3 * 71 + 2 * 344 = 901 px = 7.63 cm at 300 DPI
    expect(grid.canvasHeightPx).toBe(901);
    // Physical size in cm rounds to the printer software values (41.811 x 7.623),
    // with the ~0.01 cm slack from px<->cm rounding at 300 DPI.
    const widthCm = (grid.canvasWidthPx * 2.54) / 300;
    const heightCm = (grid.canvasHeightPx * 2.54) / 300;
    expect(widthCm).toBeCloseTo(41.81, 1);
    expect(heightCm).toBeCloseTo(7.63, 1);
  });

  it("uses 4 rows for the 12-pen maximum", () => {
    const grid = computePenBatchGrid(12);
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(4);
    // Bottom-right slot origin: row 3, col 2.
    expect(grid.slots[11]).toMatchObject({
      row: 3,
      col: 2,
      xPx: 2 * STEP_H,
      yPx: 3 * STEP_V,
    });
    // Canvas: 4939 x (4*71 + 3*344) = 4939 x 1316
    expect(grid.canvasWidthPx).toBe(4939);
    expect(grid.canvasHeightPx).toBe(1316);
  });

  it("rejects counts outside [PEN_BATCH_MIN_FILES, PEN_BATCH_MAX_FILES]", () => {
    expect(() => computePenBatchGrid(PEN_BATCH_MIN_FILES - 1)).toThrow();
    expect(() => computePenBatchGrid(PEN_BATCH_MAX_FILES + 1)).toThrow();
    expect(() => computePenBatchGrid(1.5)).toThrow();
  });

  it("keeps every slot inside the canvas bounds", () => {
    for (let n = PEN_BATCH_MIN_FILES; n <= PEN_BATCH_MAX_FILES; n += 1) {
      const grid = computePenBatchGrid(n);
      for (const slot of grid.slots) {
        expect(slot.xPx + slot.widthPx).toBeLessThanOrEqual(grid.canvasWidthPx);
        expect(slot.yPx + slot.heightPx).toBeLessThanOrEqual(grid.canvasHeightPx);
      }
    }
  });

  it("always uses exactly 3 columns (physical jig constraint)", () => {
    expect(PEN_BATCH_COLS).toBe(3);
    for (let n = PEN_BATCH_COLS + 1; n <= PEN_BATCH_MAX_FILES; n += 1) {
      expect(computePenBatchGrid(n).cols).toBe(PEN_BATCH_COLS);
    }
  });
});

describe("buildPenBatchFileName", () => {
  it("uses the pen-batch prefix and preserves drop order", () => {
    const parsed = [
      parseNotebookColorFromFileName("pix_rosu_set_daniela.png"),
      parseNotebookColorFromFileName("pix_negru_set_ivan.png"),
      parseNotebookColorFromFileName("pix_albastru_set_maria.png"),
    ];
    const fileName = buildPenBatchFileName(parsed, new Date(2026, 8, 30));
    expect(fileName).toBe("pen-batch_rosu_negru_albastru_20260930.png");
  });

  it("keeps the order-number prefix when it is present", () => {
    const parsed = [
      parseNotebookColorFromFileName("8228-negru-pen.png"),
      parseNotebookColorFromFileName("8229-rosu-pen.png"),
    ];
    const fileName = buildPenBatchFileName(parsed, new Date(2026, 8, 30));
    expect(fileName).toBe("pen-batch_8228-negru_8229-rosu_20260930.png");
  });

  it("falls back to unknown-N when colour and number are missing", () => {
    const parsed = [
      parseNotebookColorFromFileName("random-1.png"),
      parseNotebookColorFromFileName("random-2.png"),
    ];
    const fileName = buildPenBatchFileName(parsed, new Date(2026, 8, 30));
    expect(fileName).toBe("pen-batch_unknown-1_unknown-2_20260930.png");
  });
});
