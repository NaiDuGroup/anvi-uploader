import { describe, expect, it } from "vitest";
import { imageEffectiveDpi, parseStudioDoc, type StudioDoc, type StudioImageLayer } from "./document";
import {
  applyPhotoColor,
  autoEnhanceParams,
  cleanPhotoEdit,
  isIdentityEdit,
  orientedSize,
  photoEditKey,
  photoLuts,
  rotateQuarter,
  sharpenRgba,
  withPhotoEdit,
  type PhotoEdit,
} from "./photoEdit";
import { editWorkSide } from "./photoEditCanvas";

const px = (...rgb: number[]): Uint8ClampedArray => {
  const out: number[] = [];
  for (let i = 0; i < rgb.length; i += 3) out.push(rgb[i]!, rgb[i + 1]!, rgb[i + 2]!, 255);
  return new Uint8ClampedArray(out);
};
const run = (e: PhotoEdit, ...rgb: number[]): number[] => {
  const d = px(...rgb);
  applyPhotoColor(d, d.length / 4, 1, e);
  return Array.from(d);
};

describe("photo edit parameters", () => {
  it("an empty / zero edit is the identity and is dropped", () => {
    expect(isIdentityEdit(undefined)).toBe(true);
    expect(isIdentityEdit({ brightness: 0, contrast: 0, saturation: 0, filter: "none", rotate: 0 })).toBe(true);
    expect(cleanPhotoEdit({ brightness: 0, filter: "none", flipX: false })).toBeUndefined();
    expect(photoEditKey({ brightness: 0 })).toBe("");
    expect(isIdentityEdit({ rotate: 90 })).toBe(false);
    expect(isIdentityEdit({ filter: "bw" })).toBe(false);
  });

  it("withPhotoEdit merges, rounds, clamps and removes the field when back to the original", () => {
    const src: { localId: string; naturalW: number; naturalH: number; edit?: PhotoEdit } = { localId: "a", naturalW: 100, naturalH: 50 };
    const a = withPhotoEdit(src, { brightness: 33.4, contrast: 140 });
    expect(a.edit).toEqual({ brightness: 33, contrast: 100 });
    const b = withPhotoEdit(a, { brightness: 0, contrast: 0 });
    expect("edit" in b).toBe(false);
    expect(withPhotoEdit(withPhotoEdit(src, { filter: "sepia", rotate: 90 }), null)).toEqual(src);
  });

  it("quarter turns cycle and swap the drawn size", () => {
    let e: PhotoEdit | undefined;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      e = { ...e, ...rotateQuarter(e) };
      seen.push(e.rotate ?? 0);
    }
    expect(seen).toEqual([90, 180, 270, 0]);
    expect(orientedSize({ naturalW: 400, naturalH: 300, edit: { rotate: 90 } })).toEqual({ w: 300, h: 400 });
    expect(orientedSize({ naturalW: 400, naturalH: 300, edit: { rotate: 180 } })).toEqual({ w: 400, h: 300 });
  });

  it("the print resolution of a turned photo uses its turned width", () => {
    const layer = (edit?: PhotoEdit): StudioImageLayer => ({
      id: "p",
      kind: "image",
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      rotation: 0,
      mask: "rect",
      crop: { zoom: 1, ox: 0, oy: 0 },
      src: { localId: "a", naturalW: 1200, naturalH: 600, ...(edit ? { edit } : {}) },
    });
    // 1200 × 600 into 50 × 50 mm: cover by the height (600 px over 50 mm); turned: 600 px wide over 50 mm.
    expect(imageEffectiveDpi(layer())).toBeCloseTo(600 / (50 / 25.4), 5);
    expect(imageEffectiveDpi(layer({ rotate: 90 }))).toBeCloseTo(600 / (50 / 25.4), 5);
    const wide = { ...layer({ rotate: 90 }), w: 80, h: 20 };
    // Turned 600 × 1200 into 80 × 20 mm: cover by the width → 600 px over 80 mm.
    expect(imageEffectiveDpi(wide)).toBeCloseTo(600 / (80 / 25.4), 5);
  });

  it("old saved designs without `edit` parse unchanged; designs with it round-trip", () => {
    const base: StudioDoc = {
      v: 1,
      id: "d1",
      kind: "mug",
      templateId: null,
      updatedAt: 0,
      surfaces: [
        {
          id: "s",
          widthMm: 200,
          heightMm: 90,
          bleedMm: 0,
          safeMm: 3,
          background: null,
          layers: [{ id: "p", kind: "image", x: 0, y: 0, w: 50, h: 50, rotation: 0, mask: "rect", crop: { zoom: 1, ox: 0, oy: 0 }, src: { localId: "a", naturalW: 10, naturalH: 10 } }],
        },
      ],
    } as StudioDoc;
    const old = parseStudioDoc(JSON.parse(JSON.stringify(base)));
    expect(old).toEqual(base);
    const l = base.surfaces[0]!.layers[0] as StudioImageLayer;
    const withEdit = { ...base, surfaces: [{ ...base.surfaces[0]!, layers: [{ ...l, src: { ...l.src!, edit: { filter: "bw", rotate: 270, levels: { lo: [5, 6, 7], hi: [250, 251, 252] }, sharpen: 0.4 } } }] }] } as StudioDoc;
    expect(parseStudioDoc(JSON.parse(JSON.stringify(withEdit)))).toEqual(withEdit);
    // A bad value is refused (stored data is never trusted).
    const bad = JSON.parse(JSON.stringify(withEdit));
    bad.surfaces[0].layers[0].src.edit.rotate = 45;
    expect(parseStudioDoc(bad)).toBeNull();
  });
});

describe("photo pixel math", () => {
  it("identity leaves pixels untouched", () => {
    expect(run({}, 10, 120, 250)).toEqual([10, 120, 250, 255]);
  });

  it("brightness lifts, contrast spreads around mid-grey", () => {
    const [r] = run({ brightness: 50 }, 100, 100, 100);
    expect(r).toBe(140);
    const c = run({ contrast: 100 }, 100, 128, 200);
    expect(c[0]).toBeLessThan(100);
    expect(c[1]).toBe(128);
    expect(c[2]).toBeGreaterThan(200);
    expect(run({ contrast: -100 }, 0, 0, 255).slice(0, 3)).toEqual([128, 128, 128]);
  });

  it("black-and-white gives grey, saturation −100 too, +100 pushes away from grey", () => {
    const bw = run({ filter: "bw" }, 200, 50, 50);
    expect(bw[0]).toBe(bw[1]);
    expect(bw[1]).toBe(bw[2]);
    const grey = run({ saturation: -100 }, 200, 50, 50);
    expect(grey[0]).toBe(grey[2]);
    const sat = run({ saturation: 100 }, 150, 100, 100);
    expect(sat[0]! - sat[1]!).toBeGreaterThan(50);
  });

  it("sepia, warm and cool tint the way their names say", () => {
    const [sr, , sb] = run({ filter: "sepia" }, 120, 120, 120);
    expect(sr).toBeGreaterThan(sb!);
    const [wr, , wb] = run({ filter: "warm" }, 120, 120, 120);
    expect(wr).toBeGreaterThan(wb!);
    const [cr, , cb] = run({ filter: "cool" }, 120, 120, 120);
    expect(cb).toBeGreaterThan(cr!);
  });

  it("alpha is kept", () => {
    const d = new Uint8ClampedArray([200, 100, 50, 77]);
    applyPhotoColor(d, 1, 1, { filter: "bw", brightness: 20 });
    expect(d[3]).toBe(77);
  });

  it("levels stretch a dull range to the full one", () => {
    const [lr] = photoLuts({ levels: { lo: [50, 50, 50], hi: [200, 200, 200] } });
    expect(lr[50]).toBe(0);
    expect(lr[200]).toBe(255);
    expect(lr[125]).toBe(128);
  });

  it("auto-enhance finds the black / white points of a dull, tinted photo", () => {
    const d: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const v = 60 + (i % 160);
      d.push(v + 20, v, v - 10, 255);
    }
    const p = autoEnhanceParams(new Uint8ClampedArray(d));
    expect(p.levels!.lo[0]).toBeGreaterThanOrEqual(50);
    expect(p.levels!.hi[0]).toBeLessThanOrEqual(240);
    // One black / white point for the three channels: the colour balance is kept.
    expect(new Set(p.levels!.lo).size).toBe(1);
    expect(new Set(p.levels!.hi).size).toBe(1);
    expect(p.sharpen).toBeGreaterThan(0);
    // A flat picture is not stretched to noise.
    const flat = autoEnhanceParams(new Uint8ClampedArray(new Array(400).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 128))));
    expect(flat.levels!.hi[0]! - flat.levels!.lo[0]!).toBeGreaterThanOrEqual(128);
  });

  it("sharpen raises local contrast and leaves flat areas alone", () => {
    const w = 5;
    const h = 5;
    const flat = new Uint8ClampedArray(w * h * 4).fill(100);
    const f2 = new Uint8ClampedArray(flat);
    sharpenRgba(f2, w, h, 1);
    expect(Array.from(f2)).toEqual(Array.from(flat));
    const dot = new Uint8ClampedArray(flat);
    dot[(2 * w + 2) * 4] = 160;
    sharpenRgba(dot, w, h, 1);
    expect(dot[(2 * w + 2) * 4]).toBeGreaterThan(160);
  });
});

describe("working copy size", () => {
  it("steps up from the drawn size, never above the bitmap", () => {
    expect(editWorkSide(4000, 600)).toBe(768);
    expect(editWorkSide(4000, 2400)).toBe(3072);
    expect(editWorkSide(900, 2400)).toBe(900);
    expect(editWorkSide(4000, 40)).toBe(256);
  });
});

describe("frame after a quarter turn", () => {
  it("a free photo shown whole turns with its frame around the centre", async () => {
    const { frameAfterTurn } = await import("./photoEdit");
    const box = { x: 10, y: 20, w: 40, h: 20, crop: { zoom: 1 } };
    expect(frameAfterTurn(box, { w: 400, h: 200 }, { w: 200, h: 400 })).toEqual({ x: 20, y: 10, w: 20, h: 40 });
    // A zoomed photo or a slot of another shape keeps its frame.
    expect(frameAfterTurn({ ...box, crop: { zoom: 1.4 } }, { w: 400, h: 200 }, { w: 200, h: 400 })).toBeNull();
    expect(frameAfterTurn({ ...box, w: 30, h: 30 }, { w: 400, h: 200 }, { w: 200, h: 400 })).toBeNull();
    // Mirror / 180°: same shape, nothing to do.
    expect(frameAfterTurn(box, { w: 400, h: 200 }, { w: 400, h: 200 })).toBeNull();
  });
});
