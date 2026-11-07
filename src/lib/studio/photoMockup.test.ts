import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { APPAREL_PHOTO_ASSETS } from "./apparelPhotoAssets.gen";
import { apparelPrintBox } from "./apparelMockup";
import {
  APPAREL_ASSET_PX,
  PHOTO_VIEWS,
  apparelMapsAsset,
  buildFabricMaps,
  decodeFabricMaps,
  encodeFabricMaps,
  printBoxToPhotoPx,
  printOnPhoto,
  supplierColourCode,
  type PhotoViewKey,
  type Raster,
} from "./photoMockup";
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
    const dark = flat(60, 60, 255);
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

  it("finds the supplier colour of a shop SKU (cap SKUs carry the one-size 90 before the colour)", () => {
    expect(supplierColourCode("CA6502-02", ["01", "02"])).toBe("02");
    expect(supplierColourCode("GO70199060", ["01", "02", "55", "60"])).toBe("60");
    expect(supplierColourCode("PO6632-20", ["01", "02", "20", "55"])).toBe("20");
    expect(supplierColourCode("BD7201-12", ["01", "48"])).toBeNull();
  });

  it("round-trips the fabric maps through the asset encoding", () => {
    const n = 8;
    const maps = { rect: { x: 3, y: 4, w: n, h: 1 }, shade: new Float32Array(n).map((_, i) => 0.6 + i * 0.08), dx: new Float32Array(n).fill(2.5), dy: new Float32Array(n).fill(-1), grain: new Float32Array(n), mask: new Float32Array(n).fill(1) };
    const back = decodeFabricMaps(encodeFabricMaps(maps), { x: 3, y: 4 });
    for (let i = 0; i < n; i++) {
      expect(back.shade[i]).toBeCloseTo(maps.shade[i]!, 2);
      expect(back.dx[i]).toBeCloseTo(2.5, 1);
      expect(back.dy[i]).toBeCloseTo(-1, 1);
    }
    expect(back.rect).toEqual(maps.rect);
  });
});

// ─── Calibration vs the shipped assets ───────────────────────────────────

async function cutOut(key: PhotoViewKey): Promise<{ inside: (x: number, y: number) => boolean }> {
  const cal = PHOTO_VIEWS[key]!;
  const file = path.join(__dirname, "../../../public", apparelMapsAsset(cal));
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = APPAREL_PHOTO_ASSETS[key].maps;
  return {
    inside: (x, y) => {
      const lx = Math.round(x) - r.x;
      const ly = Math.round(y) - r.y;
      if (lx < 0 || ly < 0 || lx >= info.width || ly >= info.height) return false;
      return data[(ly * info.width + lx) * 4 + 3]! >= 200;
    },
  };
}

/** Every point of the box's outline (every 2 px) lies on the garment. */
async function expectOnGarment(key: PhotoViewKey, box: { x: number; y: number; w: number; h: number }): Promise<void> {
  const cal = PHOTO_VIEWS[key]!;
  const px = printBoxToPhotoPx(cal, box, APPAREL_ASSET_PX / cal.sizePx);
  const { inside } = await cutOut(key);
  const off: string[] = [];
  for (let t = 0; t <= 1.0001; t += 2 / Math.max(px.w, px.h)) {
    for (const [x, y] of [
      [px.x + t * px.w, px.y],
      [px.x + t * px.w, px.y + px.h],
      [px.x, px.y + t * px.h],
      [px.x + px.w, px.y + t * px.h],
    ] as const)
      if (!inside(x, y)) off.push(`${Math.round(x)},${Math.round(y)}`);
  }
  expect(off.slice(0, 5)).toEqual([]);
}

describe("photo calibration lands every print box on the garment", () => {
  it("T-shirt: A4 on the front, A4 on the back", async () => {
    await expectOnGarment("tshirt-front", apparelPrintBox("tshirt", "front", "front", 21, 30));
    await expectOnGarment("tshirt-back", apparelPrintBox("tshirt", "back", "back", 21, 30));
  });
  it("polo: a 10 × 10 left-chest logo, A4 on the back", async () => {
    await expectOnGarment("polo-front", apparelPrintBox("polo", "front", "chest_left", 10, 10));
    await expectOnGarment("polo-back", apparelPrintBox("polo", "back", "back", 21, 30));
  });
  it("cap: the 9 × 5 logo on the front panel", async () => {
    await expectOnGarment("cap-front", apparelPrintBox("cap", "front", "other", 9, 5));
  });
  it("bodysuit: up to A6 (10 × 15) under the neckline", async () => {
    await expectOnGarment("body-front", apparelPrintBox("body", "front", "other", 10, 15));
  });
});
