import { describe, expect, it } from "vitest";
import { PHOTO_VIEWS, buildFabricMaps, printBoxToPhotoPx, printOnPhoto, type Raster } from "./photoMockup";
import { buildInflatedGarment } from "./inflatedGarment";

const flat = (w: number, h: number, v: number, a = 255): Raster => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([v, v, v, a], i);
  return { width: w, height: h, data };
};

describe("photo mockup (prototype)", () => {
  it("maps garment cm to photo px through the view calibration, at any photo scale", () => {
    const cal = PHOTO_VIEWS["tshirt-front"]!;
    const full = printBoxToPhotoPx(cal, { x: -10.5, y: 10, w: 21, h: 29.7 });
    expect(full.x).toBeCloseTo(cal.centreXPx - 10.5 * cal.pxPerCm);
    expect(full.w).toBeCloseTo(21 * cal.pxPerCm);
    const half = printBoxToPhotoPx(cal, { x: -10.5, y: 10, w: 21, h: 29.7 }, 0.5);
    expect(half.w).toBeCloseTo(full.w / 2);
  });

  it("prints an opaque design as is on flat, evenly lit fabric (no shading, no shift)", () => {
    const photo = flat(60, 60, 20);
    const white = flat(60, 60, 230);
    const dark = flat(60, 60, 10);
    const design: Raster = { width: 2, height: 2, data: new Uint8ClampedArray([200, 50, 50, 255, 200, 50, 50, 255, 200, 50, 50, 255, 200, 50, 50, 255]) };
    const maps = buildFabricMaps(white, dark, { x: 0, y: 0, w: 60, h: 60 });
    printOnPhoto(photo, maps, design, { x: 20, y: 20, w: 20, h: 20 }, { opacity: 1 });
    const i = (30 * 60 + 30) * 4;
    expect([...photo.data.slice(i, i + 3)].map((v) => Math.round(v / 5) * 5)).toEqual([200, 50, 50]);
    // Outside the box the photo is untouched.
    expect(photo.data[(5 * 60 + 5) * 4]).toBe(20);
  });

  it("closes the inflated garment: the back mirrors every front vertex", () => {
    const n = 20;
    const mask = new Uint8Array(n * n);
    for (let y = 4; y < 16; y++) for (let x = 5; x < 15; x++) mask[y * n + x] = 1;
    const mesh = buildInflatedGarment(mask, mask, n);
    const count = mesh.positions.length / 6;
    expect(count).toBe(120);
    for (let i = 0; i < count; i++) expect(mesh.positions[(count + i) * 3 + 2]).toBeCloseTo(-mesh.positions[i * 3 + 2]!);
    expect(mesh.indices.length).toBe(mesh.frontIndexCount * 2);
  });
});
