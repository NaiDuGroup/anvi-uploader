import { describe, expect, it } from "vitest";
import { findInkBox, inkBoxCm, type RgbaPixels } from "./inkBox";

type Rgba = [number, number, number, number];

function image(width: number, height: number, bg: Rgba, square?: { x: number; y: number; size: number; color: Rgba }): RgbaPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inSquare =
        square && x >= square.x && x < square.x + square.size && y >= square.y && y < square.y + square.size;
      data.set(inSquare ? square.color : bg, (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const ORANGE: Rgba = [245, 130, 32, 255];

describe("findInkBox", () => {
  it("transparent background: the box of the opaque pixels", () => {
    const r = findInkBox(image(100, 80, [0, 0, 0, 0], { x: 30, y: 20, size: 40, color: ORANGE }));
    expect(r.box).toEqual({ x: 30, y: 20, width: 40, height: 40 });
    expect(r.fullBleed).toBe(false);
    expect(r.whiteBackground).toBe(false);
  });

  it("white background is not ink (and is flagged)", () => {
    const r = findInkBox(image(100, 80, [255, 255, 255, 255], { x: 10, y: 5, size: 20, color: ORANGE }));
    expect(r.box).toEqual({ x: 10, y: 5, width: 20, height: 20 });
    expect(r.whiteBackground).toBe(true);
    // Near-white (scanner noise) still counts as paper.
    expect(findInkBox(image(50, 50, [250, 248, 252, 255])).box).toBeNull();
  });

  it("full-bleed artwork: the box is the whole image", () => {
    const r = findInkBox(image(60, 40, [20, 40, 200, 255]));
    expect(r.box).toEqual({ x: 0, y: 0, width: 60, height: 40 });
    expect(r.fullBleed).toBe(true);
  });

  it("nearly transparent pixels are not ink", () => {
    expect(findInkBox(image(20, 20, [0, 0, 0, 5])).box).toBeNull();
  });
});

describe("inkBoxCm", () => {
  it("the dealer's lid: 1770 px square at 300 dpi ≈ 15×15 cm, also from a downscaled image", () => {
    expect(inkBoxCm({ x: 0, y: 0, width: 1770, height: 1770 }, 1, 300)).toEqual({ widthCm: 15, heightCm: 15 });
    // 3996 px wide → analysed at 1500 px: scale 2.664.
    const scale = 3996 / 1500;
    expect(inkBoxCm({ x: 0, y: 0, width: Math.round(1770 / scale), height: Math.round(1770 / scale) }, scale, 300)).toEqual({
      widthCm: 15,
      heightCm: 15,
    });
  });
});
