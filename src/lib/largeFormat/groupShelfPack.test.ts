import { describe, it, expect } from "vitest";
import {
  packGroupShelfFFDH,
  type GroupShelfPackTile,
  GROUP_SHELF_PACK_DEFAULT_GAP_CM,
} from "./groupShelfPack";

const GAP = GROUP_SHELF_PACK_DEFAULT_GAP_CM; // 5 cm

function tile(
  id: string,
  w: number,
  h: number,
  allowRotate = true,
): GroupShelfPackTile {
  return { id, label: id, widthCm: w, heightCm: h, allowRotate };
}

describe("packGroupShelfFFDH", () => {
  it("empty input → empty result", () => {
    const result = packGroupShelfFFDH([], 100, GAP);
    expect(result.placements).toHaveLength(0);
    expect(result.totalAlongCm).toBe(0);
    expect(result.unplacedTileIds).toHaveLength(0);
  });

  it("single tile → one placement, totalAlongCm = height + gap", () => {
    const result = packGroupShelfFFDH([tile("a", 40, 60)], 100, GAP);
    expect(result.placements).toHaveLength(1);
    // shelf height = 60 + GAP (each tile slot inflated by gapCm, not 2*gapCm)
    expect(result.totalAlongCm).toBeCloseTo(60 + GAP, 6);
    const p = result.placements[0]!;
    expect(p.widthCm).toBe(40);
    expect(p.heightCm).toBe(60);
    expect(p.rotated).toBe(false);
    // inner rect is offset by gapCm/2 from slot origin
    expect(p.xCm).toBeCloseTo(GAP / 2, 6);
    expect(p.yCm).toBeCloseTo(GAP / 2, 6);
  });

  it("two identical tiles that fit side-by-side → one shelf", () => {
    // each tile 40 wide → inflated slot 45; two fit in 100 cm (45+45=90)
    const result = packGroupShelfFFDH(
      [tile("a", 40, 60), tile("b", 40, 60)],
      100,
      GAP,
    );
    expect(result.placements).toHaveLength(2);
    // both on same shelf → totalAlongCm = 60 + GAP
    expect(result.totalAlongCm).toBeCloseTo(60 + GAP, 6);
  });

  it("two tiles that don't fit side-by-side → two shelves", () => {
    // each 60 wide; inflated slot = 65; can't fit two in 100 cm (65+65=130>100)
    const result = packGroupShelfFFDH(
      [tile("a", 60, 30), tile("b", 60, 30)],
      100,
      GAP,
    );
    expect(result.placements).toHaveLength(2);
    // two separate shelves, each 30 + GAP high
    expect(result.totalAlongCm).toBeCloseTo(2 * (30 + GAP), 6);
    // each tile on its own shelf → different yCm
    const ys = result.placements.map((p) => p.yCm).sort((a, b) => a - b);
    // first tile: inner y = GAP/2
    expect(ys[0]).toBeCloseTo(GAP / 2, 6);
    // second tile: shelf starts at (30 + GAP), inner y = shelf_y + GAP/2
    expect(ys[1]).toBeCloseTo(30 + GAP + GAP / 2, 6);
  });

  it("tile wider than printableWidth but fits when rotated → placed rotated", () => {
    // tile 90×40; width 90 doesn't fit in 80 cm, but 40 does
    const result = packGroupShelfFFDH([tile("a", 90, 40)], 80, GAP);
    expect(result.placements).toHaveLength(1);
    expect(result.unplacedTileIds).toHaveLength(0);
    const p = result.placements[0]!;
    expect(p.rotated).toBe(true);
    // after rotation: width=40, height=90
    expect(p.widthCm).toBe(40);
    expect(p.heightCm).toBe(90);
  });

  it("tile wider than printableWidth in any orientation → unplaced", () => {
    // tile 90×85; both 90 and 85 exceed 80 cm
    const result = packGroupShelfFFDH([tile("a", 90, 85)], 80, GAP);
    expect(result.placements).toHaveLength(0);
    expect(result.unplacedTileIds).toEqual(["a"]);
    expect(result.totalAlongCm).toBe(0);
  });

  it("tile not rotated when allowRotate=false even if it would improve fit", () => {
    // tile 90×40; doesn't fit in 80 if not rotated
    const result = packGroupShelfFFDH([tile("a", 90, 40, false)], 80, GAP);
    expect(result.unplacedTileIds).toEqual(["a"]);
  });

  it("smoke: 6 tiles of different sizes, totalAlongCm < naïve sum", () => {
    const tiles: GroupShelfPackTile[] = [
      tile("1", 80, 120),
      tile("2", 60, 80),
      tile("3", 30, 50),
      tile("4", 40, 60),
      tile("5", 20, 30),
      tile("6", 50, 70),
    ];
    const printableWidthCm = 160;
    const result = packGroupShelfFFDH(tiles, printableWidthCm, GAP);

    expect(result.unplacedTileIds).toHaveLength(0);
    expect(result.placements).toHaveLength(6);

    // naïve sum: each tile on its own shelf with gapCm inflation (same formula as algorithm)
    const naiveSum = tiles.reduce((s, t) => s + t.heightCm + GAP, 0);
    // grouped packing should be shorter (tiles share shelves)
    expect(result.totalAlongCm).toBeLessThan(naiveSum);

    // no rect should exceed printable width
    for (const p of result.placements) {
      expect(p.xCm + p.widthCm).toBeLessThanOrEqual(printableWidthCm + 1e-6);
    }
  });
});
