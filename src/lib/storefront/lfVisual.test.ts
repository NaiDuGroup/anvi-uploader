import { describe, expect, it } from "vitest";
import {
  canvasBoxPrintPoint,
  canvasPrintUv,
  canvasWrapMirrors,
  coverCrop,
  LF_CANVAS_STRETCHER_DEPTH_CM,
  LF_ROLLUP_CASSETTE_CM,
  LF_SCALE_PERSON_CM,
  LF_SCALE_PERSON_WIDTH_CM,
  lfScaleScene,
  type CanvasBoxDims,
} from "./lfVisual";

describe("real-size scene", () => {
  it("banner 200×100 hangs centred at 150 cm, to scale with the 170 cm person", () => {
    const s = lfScaleScene("banner", 200, 100);
    expect(s.product.w).toBe(200);
    expect(s.product.h).toBe(100);
    expect(s.floorY - (s.product.y + s.product.h)).toBe(100); // bottom 100 cm above the floor
    expect(s.floorY - s.person.y).toBe(LF_SCALE_PERSON_CM);
    expect(s.person.x + LF_SCALE_PERSON_WIDTH_CM).toBeLessThan(s.product.x);
    expect(s.product.x + s.product.w).toBeLessThan(s.width);
    expect(s.cassette).toBeNull();
    expect(s.poles).toHaveLength(0);
  });

  it("a 500×160 banner fits: scene wider, everything inside the view box", () => {
    const s = lfScaleScene("banner", 500, 160);
    expect(s.width).toBeGreaterThan(500 + LF_SCALE_PERSON_WIDTH_CM);
    expect(s.heightLabel.x + s.fontCm * 4).toBeLessThanOrEqual(s.width + 1e-9);
    expect(s.widthLabel.y).toBeLessThan(s.height);
    expect(s.product.y).toBeGreaterThan(0);
  });

  it("tall pieces stand on the floor", () => {
    const s = lfScaleScene("banner", 100, 400);
    expect(s.product.y + s.product.h).toBe(s.floorY);
    expect(s.product.y).toBeGreaterThan(0);
    expect(s.widthLabel.y).toBeGreaterThan(s.floorY);
    expect(s.widthLabel.y).toBeLessThan(s.height);
  });

  it("poster and canvas on a wall at ~150 cm; canvas shows its frame depth", () => {
    const p = lfScaleScene("poster", 30, 40);
    expect(p.product.y + p.product.h / 2).toBe(p.floorY - 150);
    expect(p.depthCm).toBe(0);
    const c = lfScaleScene("canvas", 50, 70);
    expect(c.depthCm).toBe(LF_CANVAS_STRETCHER_DEPTH_CM);
  });

  it("roll-up stands on its cassette with a pole; X-banner on its X-frame", () => {
    const r = lfScaleScene("rollup", 120, 200);
    expect(r.cassette).not.toBeNull();
    expect(r.cassette!.y + r.cassette!.h).toBe(r.floorY);
    expect(r.product.y + r.product.h).toBe(r.cassette!.y);
    expect(r.cassette!.w).toBe(120 + 2 * LF_ROLLUP_CASSETTE_CM.overhang);
    expect(r.poles).toHaveLength(1);
    const x = lfScaleScene("xbanner", 80, 180);
    expect(x.poles).toHaveLength(4);
    expect(Math.max(...x.poles.map((l) => Math.max(l.y1, l.y2)))).toBe(x.floorY);
    expect(x.product.y + x.product.h).toBeLessThan(x.floorY);
  });
});

describe("cover crop", () => {
  it("crops the wide side, centred", () => {
    expect(coverCrop(4000, 2000, 50, 50)).toEqual({ sx: 1000, sy: 0, sw: 2000, sh: 2000 });
    expect(coverCrop(1000, 3000, 2, 1)).toEqual({ sx: 0, sy: 1250, sw: 1000, sh: 500 });
  });
});

describe("3D canvas UVs", () => {
  const d: CanvasBoxDims = { widthCm: 50, heightCm: 70, depthCm: 2, wrapCm: 4 };

  it("the face maps onto the face of the print", () => {
    expect(canvasBoxPrintPoint("front", -25, 35, 1, d)).toEqual({ u: 4, v: 4 });
    expect(canvasBoxPrintPoint("front", 25, -35, 1, d)).toEqual({ u: 54, v: 74 });
  });

  it("each side starts at the fold line and runs into the wrap by the frame depth", () => {
    expect(canvasBoxPrintPoint("right", 25, 0, 1, d)).toEqual({ u: 54, v: 39 });
    expect(canvasBoxPrintPoint("right", 25, 0, -1, d)).toEqual({ u: 56, v: 39 });
    expect(canvasBoxPrintPoint("left", -25, 0, -1, d)).toEqual({ u: 2, v: 39 });
    expect(canvasBoxPrintPoint("top", 0, 35, -1, d)).toEqual({ u: 29, v: 2 });
    expect(canvasBoxPrintPoint("bottom", 0, -35, -1, d)).toEqual({ u: 29, v: 76 });
  });

  it("UVs are 0..1 with v up", () => {
    expect(canvasPrintUv({ u: 0, v: 0 }, d)).toEqual([0, 1]);
    expect(canvasPrintUv({ u: 58, v: 78 }, d)).toEqual([1, 0]);
  });

  it("the side strip mirrors the face edge (a point 1 cm into the wrap shows the face 1 cm in)", () => {
    // Left mirror: x' = 2w − x. Wrap point x = 3 (1 cm outside the fold at 4) ← face point x = 5.
    const [left, right, top, bottom] = canvasWrapMirrors(50, 70, 4);
    const apply = (m: number[], x: number, y: number) => [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!];
    expect(apply(left!.m, 5, 10)).toEqual([3, 10]);
    expect(apply(right!.m, 53, 10)).toEqual([55, 10]);
    expect(apply(top!.m, 10, 5)).toEqual([10, 3]);
    expect(apply(bottom!.m, 10, 73)).toEqual([10, 75]);
    expect(canvasWrapMirrors(50, 70, 0)).toEqual([]);
  });
});
