import { describe, expect, it } from "vitest";
import {
  FREEPACK_MAX_FILES,
  FREEPACK_MAX_WIDTH_CM,
  FREEPACK_MIN_FILES,
  computeFreepackLayout,
  freepackTilesAllSameSize,
  freepackUniqueSizeCount,
  type FreepackTileSize,
} from "./freepackLayout";
import { cmToPx } from "@/lib/printDimensions";

/**
 * The real UV bed limit at 300 DPI — kept as a derived constant so a tweak
 * to FREEPACK_MAX_WIDTH_CM in the production file automatically flows into
 * the test expectations.
 */
const MAX_W_300 = cmToPx(FREEPACK_MAX_WIDTH_CM, 300); // 7087

/** Tile with the same dims repeated `count` times. */
function uniformSizes(count: number, w: number, h: number): FreepackTileSize[] {
  return Array.from({ length: count }, () => ({ widthPx: w, heightPx: h }));
}

describe("public constants", () => {
  it("MIN < MAX, both integers", () => {
    expect(Number.isInteger(FREEPACK_MIN_FILES)).toBe(true);
    expect(Number.isInteger(FREEPACK_MAX_FILES)).toBe(true);
    expect(FREEPACK_MIN_FILES).toBeLessThan(FREEPACK_MAX_FILES);
    expect(FREEPACK_MIN_FILES).toBe(2);
    expect(FREEPACK_MAX_FILES).toBe(20);
  });

  it("60 cm @ 300 DPI = 7087 px (sanity for the UV bed cap)", () => {
    expect(MAX_W_300).toBe(7087);
  });
});

describe("computeFreepackLayout: equal tiles", () => {
  it("4 tiles that each fit 2× in a row → 2 rows of 2", () => {
    // 3000·2 = 6000 < 7087, so 2 tiles fit per row.
    const layout = computeFreepackLayout({
      sizes: uniformSizes(4, 3000, 2000),
      maxWidthPx: MAX_W_300,
    });
    expect(layout.rows).toHaveLength(2);
    expect(layout.rows[0]).toMatchObject({
      widthPx: 6000,
      heightPx: 2000,
      startY: 0,
      tileCount: 2,
    });
    expect(layout.rows[1]).toMatchObject({
      widthPx: 6000,
      heightPx: 2000,
      startY: 2000,
      tileCount: 2,
    });
    expect(layout.canvasWidthPx).toBe(6000);
    expect(layout.canvasHeightPx).toBe(4000);
    // Slot positions are row-major, zero-origin per row.
    expect(layout.slots.map((s) => [s.row, s.colInRow])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
    expect(layout.slots[2]).toMatchObject({ offsetXPx: 0, offsetYPx: 2000 });
    expect(layout.slots[3]).toMatchObject({ offsetXPx: 3000, offsetYPx: 2000 });
  });

  it("5 identical tiles → row 0 (2), row 1 (2), row 2 (1)", () => {
    const layout = computeFreepackLayout({
      sizes: uniformSizes(5, 3000, 2000),
      maxWidthPx: MAX_W_300,
    });
    expect(layout.rows).toHaveLength(3);
    expect(layout.rows[2]).toMatchObject({
      widthPx: 3000,
      heightPx: 2000,
      startY: 4000,
      tileCount: 1,
    });
    // Final partial row contributes to canvas height but not to width.
    expect(layout.canvasWidthPx).toBe(6000);
    expect(layout.canvasHeightPx).toBe(6000);
  });
});

describe("computeFreepackLayout: mixed heights in one row", () => {
  it("row height = max(heights), shorter tiles sit flush against the top edge", () => {
    const layout = computeFreepackLayout({
      sizes: [
        { widthPx: 2000, heightPx: 1500 }, // short
        { widthPx: 2000, heightPx: 2500 }, // tall  — defines row height
        { widthPx: 2000, heightPx: 1000 }, // shorter still
      ],
      maxWidthPx: MAX_W_300,
    });
    // All three fit (6000 < 7087) → single row of height 2500.
    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0]).toMatchObject({
      widthPx: 6000,
      heightPx: 2500,
      startY: 0,
      tileCount: 3,
    });
    expect(layout.canvasWidthPx).toBe(6000);
    expect(layout.canvasHeightPx).toBe(2500);
    // Shorter tiles sit at offsetY = 0 (top-left); their heightPx is kept so
    // the renderer draws at 1:1 without stretching.
    expect(layout.slots[0]).toMatchObject({ offsetYPx: 0, heightPx: 1500 });
    expect(layout.slots[2]).toMatchObject({ offsetYPx: 0, heightPx: 1000 });
  });
});

describe("computeFreepackLayout: overflow mid-row", () => {
  it("second tile pushes past maxWidth → bumped to a new row", () => {
    // 4000 + 4000 = 8000 > 7087 → tile 1 overflows.
    const layout = computeFreepackLayout({
      sizes: uniformSizes(2, 4000, 2500),
      maxWidthPx: MAX_W_300,
    });
    expect(layout.rows).toHaveLength(2);
    expect(layout.rows[0]).toMatchObject({ tileCount: 1, widthPx: 4000 });
    expect(layout.rows[1]).toMatchObject({ tileCount: 1, widthPx: 4000, startY: 2500 });
    expect(layout.canvasWidthPx).toBe(4000);
    expect(layout.canvasHeightPx).toBe(5000);
  });

  it("row 0 is filled, row 1 keeps packing from scratch (asymmetric widths)", () => {
    const layout = computeFreepackLayout({
      sizes: [
        { widthPx: 4000, heightPx: 1000 }, // r0
        { widthPx: 3000, heightPx: 1500 }, // r0 (4000+3000=7000 ≤ 7087)
        { widthPx: 3000, heightPx: 500 }, // overflow → r1
        { widthPx: 2000, heightPx: 2000 }, // r1
      ],
      maxWidthPx: MAX_W_300,
    });
    expect(layout.rows).toHaveLength(2);
    expect(layout.rows[0]).toMatchObject({ tileCount: 2, widthPx: 7000, heightPx: 1500 });
    expect(layout.rows[1]).toMatchObject({ tileCount: 2, widthPx: 5000, heightPx: 2000, startY: 1500 });
    expect(layout.canvasWidthPx).toBe(7000);
    expect(layout.canvasHeightPx).toBe(3500);
    // Row-1 tiles start at X=0, X=3000.
    expect(layout.slots[2]).toMatchObject({ offsetXPx: 0, offsetYPx: 1500 });
    expect(layout.slots[3]).toMatchObject({ offsetXPx: 3000, offsetYPx: 1500 });
  });
});

describe("computeFreepackLayout: exact-fit edge cases", () => {
  it("tile exactly `maxWidthPx` wide fills the row by itself", () => {
    const layout = computeFreepackLayout({
      sizes: [
        { widthPx: MAX_W_300, heightPx: 1000 }, // r0 full
        { widthPx: 500, heightPx: 500 }, // r1
      ],
      maxWidthPx: MAX_W_300,
    });
    expect(layout.rows).toHaveLength(2);
    expect(layout.rows[0]).toMatchObject({ tileCount: 1, widthPx: MAX_W_300 });
    expect(layout.rows[1]).toMatchObject({ tileCount: 1, widthPx: 500, startY: 1000 });
  });

  it("two tiles whose combined width exactly equals maxWidthPx share one row", () => {
    const half = Math.floor(MAX_W_300 / 2); // 3543
    const other = MAX_W_300 - half; // 3544 → 3543 + 3544 = 7087 = maxW
    const layout = computeFreepackLayout({
      sizes: [
        { widthPx: half, heightPx: 1000 },
        { widthPx: other, heightPx: 1200 },
      ],
      maxWidthPx: MAX_W_300,
    });
    // Equality isn't an overflow (strict `>` in the guard), so both fit.
    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0].widthPx).toBe(MAX_W_300);
    expect(layout.canvasWidthPx).toBe(MAX_W_300);
  });
});

describe("computeFreepackLayout: validation", () => {
  it("throws when count < MIN", () => {
    expect(() =>
      computeFreepackLayout({
        sizes: [{ widthPx: 100, heightPx: 100 }],
        maxWidthPx: MAX_W_300,
      }),
    ).toThrow(/between 2 and 20/);
  });

  it("throws when count > MAX", () => {
    expect(() =>
      computeFreepackLayout({
        sizes: uniformSizes(21, 100, 100),
        maxWidthPx: MAX_W_300,
      }),
    ).toThrow(/between 2 and 20/);
  });

  it("throws for a zero or negative tile dimension", () => {
    expect(() =>
      computeFreepackLayout({
        sizes: [
          { widthPx: 0, heightPx: 100 },
          { widthPx: 100, heightPx: 100 },
        ],
        maxWidthPx: MAX_W_300,
      }),
    ).toThrow(/non-positive/);
  });

  it("throws for a tile wider than maxWidthPx", () => {
    expect(() =>
      computeFreepackLayout({
        sizes: [
          { widthPx: MAX_W_300 + 1, heightPx: 100 },
          { widthPx: 100, heightPx: 100 },
        ],
        maxWidthPx: MAX_W_300,
      }),
    ).toThrow(/wider than max row width/);
  });

  it("throws for a zero / negative maxWidthPx", () => {
    expect(() =>
      computeFreepackLayout({
        sizes: uniformSizes(2, 100, 100),
        maxWidthPx: 0,
      }),
    ).toThrow(/positive/);
  });
});

describe("freepackTilesAllSameSize", () => {
  it("true when every tile matches", () => {
    expect(freepackTilesAllSameSize(uniformSizes(5, 200, 300))).toBe(true);
  });

  it("false when at least one tile differs", () => {
    expect(
      freepackTilesAllSameSize([
        { widthPx: 200, heightPx: 300 },
        { widthPx: 200, heightPx: 300 },
        { widthPx: 201, heightPx: 300 }, // odd one out
      ]),
    ).toBe(false);
  });

  it("empty / single-tile arrays are trivially 'all same'", () => {
    expect(freepackTilesAllSameSize([])).toBe(true);
    expect(freepackTilesAllSameSize([{ widthPx: 100, heightPx: 100 }])).toBe(true);
  });
});

describe("freepackUniqueSizeCount", () => {
  it("counts (w × h) pairs regardless of order", () => {
    expect(
      freepackUniqueSizeCount([
        { widthPx: 100, heightPx: 100 }, // A
        { widthPx: 100, heightPx: 100 }, // A
        { widthPx: 200, heightPx: 100 }, // B
        { widthPx: 100, heightPx: 200 }, // C (same w as A but different h)
        { widthPx: 200, heightPx: 100 }, // B again
      ]),
    ).toBe(3);
  });
});
