import { describe, expect, it } from "vitest";
import { GROUP_TILE_PACK_DEFAULT_GAP_CM } from "./groupTilePack";
import type { GroupTilePackTile } from "./groupTilePack";
import { evaluateLfRollOptions, type LfRollOption } from "./lfRollChoice";

// Production ORACAL MATT catalog values as of 2026-08.
const NARROW: LfRollOption = {
  materialId: "narrow",
  name: "ORACAL MATT 1.27*50m",
  printableWidthCm: 122,
  rollWidthMeters: 1.27,
  costPerLinearMeterMdl: 44.3092,
  stockLinearMeters: 29.554,
};

const WIDE: LfRollOption = {
  materialId: "wide",
  name: "ORACAL MATT 1.62*50m",
  printableWidthCm: 157,
  rollWidthMeters: 1.62,
  costPerLinearMeterMdl: 56.52,
  stockLinearMeters: 46,
};

function tiles(dims: Array<[number, number]>): GroupTilePackTile[] {
  return dims.map(([w, h], i) => ({
    id: `t${i}`,
    label: `#${i}`,
    widthCm: w,
    heightCm: h,
    allowRotate: true,
  }));
}

describe("evaluateLfRollOptions", () => {
  it("picks the wide roll when the extra column beats the higher per-meter cost", () => {
    const { evaluations, best } = evaluateLfRollOptions(
      tiles([
        [40, 60],
        [40, 60],
        [40, 60],
      ]),
      [NARROW, WIDE],
      GROUP_TILE_PACK_DEFAULT_GAP_CM,
    );

    // Narrow: two rotated per row → 82 cm → 36 MDL.
    // Wide: all three in one row → 61 cm → 34 MDL.
    expect(best?.option.materialId).toBe("wide");
    const narrowEval = evaluations.find((e) => e.option.materialId === "narrow")!;
    const wideEval = evaluations.find((e) => e.option.materialId === "wide")!;
    expect(narrowEval.costMdl).toBe(36);
    expect(wideEval.costMdl).toBe(34);
    expect(wideEval.linearMeters).toBeCloseTo(0.61, 5);
  });

  it("picks the narrow roll when both consume the same length", () => {
    const { best } = evaluateLfRollOptions(
      tiles([
        [60, 60],
        [60, 60],
      ]),
      [NARROW, WIDE],
      GROUP_TILE_PACK_DEFAULT_GAP_CM,
    );

    // Both rolls take one 61 cm row; 44.31 MDL/lm beats 56.52 MDL/lm.
    expect(best?.option.materialId).toBe("narrow");
    expect(best?.costMdl).toBe(27);
  });

  it("marks a roll that cannot fit a tile and falls back to the fitting one", () => {
    const { evaluations, best } = evaluateLfRollOptions(
      tiles([[150, 200]]),
      [NARROW, WIDE],
      GROUP_TILE_PACK_DEFAULT_GAP_CM,
    );

    const narrowEval = evaluations.find((e) => e.option.materialId === "narrow")!;
    expect(narrowEval.fits).toBe(false);
    expect(narrowEval.unplacedTileIds).toEqual(["t0"]);
    expect(best?.option.materialId).toBe("wide");
    expect(best?.fits).toBe(true);
    // Fitting candidates sort ahead of non-fitting ones.
    expect(evaluations[0]!.option.materialId).toBe("wide");
  });

  it("flags insufficient stock without changing the recommendation", () => {
    const lowStockNarrow: LfRollOption = { ...NARROW, stockLinearMeters: 0.3 };
    const { best } = evaluateLfRollOptions(
      tiles([
        [60, 60],
        [60, 60],
      ]),
      [lowStockNarrow, WIDE],
      GROUP_TILE_PACK_DEFAULT_GAP_CM,
    );

    // 0.61 lm needed, 0.3 lm in stock: still the cheapest, but flagged.
    expect(best?.option.materialId).toBe("narrow");
    expect(best?.enoughStock).toBe(false);
  });

  it("returns zero-cost evaluations and a narrow-first best for an empty tile set", () => {
    const { evaluations, best } = evaluateLfRollOptions(
      [],
      [WIDE, NARROW],
      GROUP_TILE_PACK_DEFAULT_GAP_CM,
    );

    expect(evaluations.every((e) => e.fits && e.costMdl === 0)).toBe(true);
    expect(best?.option.materialId).toBe("narrow");
  });
});
