import { describe, it, expect } from "vitest";
import {
  packGroupTiles,
  type GroupTilePackTile,
  GROUP_TILE_PACK_DEFAULT_GAP_CM,
} from "./groupTilePack";

const GAP = GROUP_TILE_PACK_DEFAULT_GAP_CM;

function tile(
  id: string,
  w: number,
  h: number,
  allowRotate = true,
): GroupTilePackTile {
  return { id, label: id, widthCm: w, heightCm: h, allowRotate };
}

/** True if the inner rects of two placements (inflated by gap/2 on each side) overlap. */
function overlapsWithGap(
  a: { xCm: number; yCm: number; widthCm: number; heightCm: number },
  b: { xCm: number; yCm: number; widthCm: number; heightCm: number },
  gap: number,
): boolean {
  const half = gap / 2;
  const aL = a.xCm - half;
  const aR = a.xCm + a.widthCm + half;
  const aT = a.yCm - half;
  const aB = a.yCm + a.heightCm + half;
  const bL = b.xCm - half;
  const bR = b.xCm + b.widthCm + half;
  const bT = b.yCm - half;
  const bB = b.yCm + b.heightCm + half;
  return aL < bR - 1e-6 && bL < aR - 1e-6 && aT < bB - 1e-6 && bT < aB - 1e-6;
}

describe("packGroupTiles", () => {
  it("empty input → empty result", () => {
    const result = packGroupTiles([], 100, GAP);
    expect(result.placements).toHaveLength(0);
    expect(result.totalAlongCm).toBe(0);
    expect(result.unplacedTileIds).toHaveLength(0);
  });

  it("single tile → rotated to the orientation that uses less roll", () => {
    // 40×60 on a 100 wide strip: rotating to 60×40 cuts roll usage to 40+gap.
    const result = packGroupTiles([tile("a", 40, 60)], 100, GAP);
    expect(result.placements).toHaveLength(1);
    expect(result.totalAlongCm).toBeCloseTo(40 + GAP, 6);
    const p = result.placements[0]!;
    expect(p.widthCm).toBe(60);
    expect(p.heightCm).toBe(40);
    expect(p.rotated).toBe(true);
    expect(p.xCm).toBeCloseTo(GAP / 2, 6);
    expect(p.yCm).toBeCloseTo(GAP / 2, 6);
  });

  it("two identical 40×60 tiles → side-by-side natural beats rotation", () => {
    // Two 40×60 (inflated 45) side-by-side fit in 100, total length = 65.
    // Rotating either would make the strip wider (65), forcing them to stack.
    const result = packGroupTiles(
      [tile("a", 40, 60), tile("b", 40, 60)],
      100,
      GAP,
    );
    expect(result.placements).toHaveLength(2);
    expect(result.totalAlongCm).toBeCloseTo(60 + GAP, 6);
  });

  it("two tiles that don't fit side-by-side in natural orientation → packer rotates to save length", () => {
    // 60×30 natural needs inflated width 65; two side-by-side = 130 > 100.
    // Rotated to 30×60 inflated 35; two side-by-side = 70, both fit.
    const result = packGroupTiles(
      [tile("a", 60, 30), tile("b", 60, 30)],
      100,
      GAP,
    );
    expect(result.placements).toHaveLength(2);
    expect(result.totalAlongCm).toBeCloseTo(60 + GAP, 6);
  });

  it("tile wider than printableWidth but fits when rotated → rotated placement", () => {
    const result = packGroupTiles([tile("a", 90, 40)], 80, GAP);
    expect(result.placements).toHaveLength(1);
    expect(result.unplacedTileIds).toHaveLength(0);
    const p = result.placements[0]!;
    expect(p.rotated).toBe(true);
    expect(p.widthCm).toBe(40);
    expect(p.heightCm).toBe(90);
  });

  it("tile exceeding printableWidth in any orientation → unplaced", () => {
    const result = packGroupTiles([tile("a", 90, 85)], 80, GAP);
    expect(result.placements).toHaveLength(0);
    expect(result.unplacedTileIds).toEqual(["a"]);
    expect(result.totalAlongCm).toBe(0);
  });

  it("non-rotatable tile is left unplaced if natural orientation doesn't fit", () => {
    const result = packGroupTiles([tile("a", 90, 40, false)], 80, GAP);
    expect(result.unplacedTileIds).toEqual(["a"]);
  });

  it("backfills dead space under a tall tile (production case)", () => {
    // Real prod scenario on ORACAL GLOSS 1.27×50m:
    //   - 1× 250×21 banner (rotates to 21×250)
    //   - 1× 60×45
    //   - 1× 21×30
    //   - 2× 35×50
    // Printable width = 122 cm, gap = 5 cm.
    //
    // The old shelf-FFDH would put 250×21 (rotated) + 60×45 + 21×30 on one
    // shelf of height 255 cm, then a second shelf for the two 35×50 tiles,
    // wasting > 200 cm of length below the 60×45 / 21×30 tiles.
    //
    // A skyline packer can fit every smaller tile *next to* the 250×21
    // banner, so total length should not exceed 21 + 5 = 26 banner slot
    // length, i.e. ~250 cm + gap padding.
    const tiles: GroupTilePackTile[] = [
      tile("banner", 250, 21),
      tile("a", 60, 45),
      tile("b", 21, 30),
      tile("c1", 35, 50),
      tile("c2", 35, 50),
    ];
    const result = packGroupTiles(tiles, 122, 5);
    expect(result.unplacedTileIds).toHaveLength(0);
    // Must beat the shelf-FFDH lower bound by a healthy margin.
    expect(result.totalAlongCm).toBeLessThan(310);
    expect(result.totalAlongCm).toBeLessThanOrEqual(255 + 1e-6);
  });

  it("no two placements overlap (incl. gap)", () => {
    const tiles: GroupTilePackTile[] = [
      tile("1", 80, 120),
      tile("2", 60, 80),
      tile("3", 30, 50),
      tile("4", 40, 60),
      tile("5", 20, 30),
      tile("6", 50, 70),
      tile("7", 25, 25),
    ];
    const result = packGroupTiles(tiles, 160, GAP);
    expect(result.unplacedTileIds).toHaveLength(0);
    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        expect(
          overlapsWithGap(result.placements[i]!, result.placements[j]!, GAP),
        ).toBe(false);
      }
    }
    for (const p of result.placements) {
      expect(p.xCm).toBeGreaterThanOrEqual(GAP / 2 - 1e-6);
      expect(p.yCm).toBeGreaterThanOrEqual(GAP / 2 - 1e-6);
      expect(p.xCm + p.widthCm).toBeLessThanOrEqual(160 - GAP / 2 + 1e-6);
    }
  });

  it("totalAlongCm ≤ naïve length for any non-trivial input", () => {
    const tiles: GroupTilePackTile[] = [
      tile("1", 80, 120),
      tile("2", 60, 80),
      tile("3", 30, 50),
      tile("4", 40, 60),
      tile("5", 20, 30),
      tile("6", 50, 70),
    ];
    const printableWidthCm = 160;
    const result = packGroupTiles(tiles, printableWidthCm, GAP);
    const naive = tiles.reduce((sum, t) => {
      const fitsNatural = t.widthCm + GAP <= printableWidthCm;
      const h = fitsNatural ? t.heightCm : t.widthCm;
      return sum + h + GAP;
    }, 0);
    expect(result.totalAlongCm).toBeLessThanOrEqual(naive);
  });

  it("reuses the smaller cross-strip strip when only one tile fits across", () => {
    // Roll = 50 wide, gap = 5; tiles are 45×10 (inflated 50×15).
    // Only one fits side-by-side (50 == roll), so they should stack
    // vertically with total length = N × (10 + 5) for N tiles.
    const tiles = [tile("a", 45, 10), tile("b", 45, 10), tile("c", 45, 10)];
    const result = packGroupTiles(tiles, 50, 5);
    expect(result.placements).toHaveLength(3);
    expect(result.totalAlongCm).toBeCloseTo(3 * (10 + 5), 6);
  });

  it("7×30×40 on 102cm mixes orientations instead of leaving a 3+3+1 tail", () => {
    // Production PHOTO PAPER case: skyline natural-first packs 3+3+1 = 123 cm.
    // Homogeneous DP finds 1×3 standing + 2×2 lying = 41+31+31 = 103 cm.
    const tiles = Array.from({ length: 7 }, (_, i) => tile(`t${i}`, 30, 40));
    const result = packGroupTiles(tiles, 102, GAP);
    expect(result.unplacedTileIds).toHaveLength(0);
    expect(result.placements).toHaveLength(7);
    expect(result.totalAlongCm).toBeCloseTo(103, 6);
    expect(result.placements.some((p) => p.rotated)).toBe(true);
    expect(result.placements.some((p) => !p.rotated)).toBe(true);

    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        expect(
          overlapsWithGap(result.placements[i]!, result.placements[j]!, GAP),
        ).toBe(false);
      }
    }
  });
});
