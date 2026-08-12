import { describe, it, expect } from "vitest";
import { packGroupTiles, type GroupTilePackTile } from "./groupTilePack";
import {
  applyOrientationPins,
  pinFitsPrintableWidth,
  toggleOrientationPin,
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
  it("toggles: no pin → opposite, pin → clear", () => {
    const t = tile("a", 30, 40);
    // Already rotated by packer → first click locks natural (visible flip).
    expect(toggleOrientationPin(undefined, true, t, 102, 1)).toBe("natural");
    // Already natural → first click locks rotated.
    expect(toggleOrientationPin(undefined, false, t, 102, 1)).toBe("rotated");
    // Second click clears either pin.
    expect(toggleOrientationPin("natural", false, t, 102, 1)).toBeUndefined();
    expect(toggleOrientationPin("rotated", true, t, 102, 1)).toBeUndefined();
  });

  it("does not pin opposite when it cannot fit printable width", () => {
    const t = tile("a", 90, 100);
    expect(pinFitsPrintableWidth(t, "natural", 95, 1)).toBe(true);
    expect(pinFitsPrintableWidth(t, "rotated", 95, 1)).toBe(false);
    // Currently natural; opposite (rotated) does not fit → stay auto.
    expect(toggleOrientationPin(undefined, false, t, 95, 1)).toBeUndefined();
    // Currently rotated; opposite (natural) fits → pin natural.
    expect(toggleOrientationPin(undefined, true, t, 95, 1)).toBe("natural");
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
