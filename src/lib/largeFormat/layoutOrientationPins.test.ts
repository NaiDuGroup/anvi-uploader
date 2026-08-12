import { describe, it, expect } from "vitest";
import { packGroupTiles, type GroupTilePackTile } from "./groupTilePack";
import {
  applyOrientationPins,
  cycleOrientationPin,
  nextOrientationPin,
  pinFitsPrintableWidth,
  withPinRotatedFlags,
} from "./layoutOrientationPins";

function tile(
  id: string,
  w: number,
  h: number,
  allowRotate = true,
): GroupTilePackTile {
  return { id, label: id, widthCm: w, heightCm: h, allowRotate };
}

describe("layoutOrientationPins", () => {
  it("cycles auto → natural → rotated → auto", () => {
    expect(nextOrientationPin(undefined)).toBe("natural");
    expect(nextOrientationPin("natural")).toBe("rotated");
    expect(nextOrientationPin("rotated")).toBeUndefined();
  });

  it("skips rotated when it cannot fit printable width", () => {
    // Natural 80×40 fits 100; rotated cross 40+gap fits; both OK.
    expect(pinFitsPrintableWidth(tile("a", 80, 40), "natural", 100, 1)).toBe(
      true,
    );
    // 90×40 natural fits 100 with gap; rotated needs 40+1=41 OK too.
    // Tall piece: 30×95 — natural cross 31 OK on 100; rotated cross 96 OK.
    // Piece that only fits natural: 90×20 on width 92 → natural 91 OK, rotated 21 OK.
    // Only-natural: width 90 height 100 on printable 95 → natural 91 OK, rotated 101 no.
    const t = tile("a", 90, 100);
    expect(pinFitsPrintableWidth(t, "natural", 95, 1)).toBe(true);
    expect(pinFitsPrintableWidth(t, "rotated", 95, 1)).toBe(false);
    expect(cycleOrientationPin(undefined, t, 95, 1)).toBe("natural");
    expect(cycleOrientationPin("natural", t, 95, 1)).toBeUndefined();
  });

  it("applyOrientationPins swaps dims for rotated and locks allowRotate", () => {
    const tiles = [tile("a", 30, 40), tile("b", 30, 40)];
    const pins = new Map([
      ["a", "rotated" as const],
      ["b", "natural" as const],
    ]);
    const prepared = applyOrientationPins(tiles, pins);
    expect(prepared[0]).toMatchObject({
      widthCm: 40,
      heightCm: 30,
      allowRotate: false,
    });
    expect(prepared[1]).toMatchObject({
      widthCm: 30,
      heightCm: 40,
      allowRotate: false,
    });
  });

  it("pinned rotated copy keeps placement.rotated true for PDF after re-pack", () => {
    const tiles = [
      tile("a", 30, 40),
      tile("b", 30, 40),
      tile("c", 30, 40),
    ];
    const pins = new Map([["c", "rotated" as const]]);
    const packed = packGroupTiles(
      applyOrientationPins(tiles, pins),
      102,
      1,
    );
    const result = withPinRotatedFlags(packed, pins);
    expect(result.unplacedTileIds).toHaveLength(0);
    const c = result.placements.find((p) => p.tileId === "c");
    expect(c).toBeDefined();
    expect(c!.rotated).toBe(true);
    expect(c!.widthCm).toBe(40);
    expect(c!.heightCm).toBe(30);
  });
});
