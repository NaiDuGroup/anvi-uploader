/**
 * Photo-real apparel mockups (prototype, branch `apparel-visual`).
 *
 * The supplier (Gor Factory: ROLY / Stamina) publishes ghost-mannequin photos
 * of every model in every colour, 2000 × 2000 px, from the SAME shot: the
 * garment sits on the same pixels in every colour. So one calibration per
 * model + view (where the collar is, px per cm) serves all colours, and:
 *
 *  - the real colour photo is the base (no fake recolouring for stocked colours);
 *  - the WHITE photo gives the fabric shading (folds, light fall-off) and the
 *    relief used to bend the print — it has by far the most detail, and it is
 *    applied to the print on a black shirt too, so a print on black still
 *    shows the folds;
 *  - the BLACK photo gives a clean cut-out mask (white background).
 *
 * Everything here works on plain RGBA rasters (`ImageData`-shaped), so the same
 * code runs in the browser (Canvas 2D `getImageData`) and in Node
 * (`@napi-rs/canvas`) for cart thumbnails / approval images. Pure.
 */
import type { ApparelPrintBox } from "./apparelMockup";

/** RGBA pixels, `ImageData`-shaped. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PhotoView = "front" | "back";

/**
 * One supplier photo view, calibrated once by hand (all colours share it).
 * Garment coordinates are the ones of `apparelMockup.ts`: cm, x = 0 on the
 * centre line, y = 0 at the high shoulder point (cap: top of the crown).
 */
export interface PhotoViewCalibration {
  /** Supplier model code («CA6502»). */
  model: string;
  view: PhotoView;
  /** Photo URL with `{c}` for the supplier colour code («01» white, «02» black, «55» navy, «60» red). */
  photo: string;
  /** Pixel size the numbers below are measured at (the HD photos are 2000). */
  sizePx: number;
  /** x of the garment's centre line, px. */
  centreXPx: number;
  /** y of garment y = 0 (HPS / crown top), px. */
  originYPx: number;
  /** Scale at the reference size (L), px per cm. */
  pxPerCm: number;
  /** Colour code whose photo gives the shading / relief (the white one). */
  shadeColour: string;
  /** Colour code whose photo gives the cut-out mask (a dark one on the white background). */
  maskColour: string;
  /** Colours shipped as assets (the shop's colours + white, the recolour source); others are recoloured. */
  colours: string[];
  /** Curved surface (cap crown): how much horizontal lines bow down at the sides (share of the box height). */
  bow?: number;
  /** Curved surface: horizontal foreshortening towards the sides, 0..0.95. */
  wrap?: number;
  /** Strength of the print bending with the folds, px at `sizePx`. */
  reliefPx?: number;
}

/** Calibrations of the prototype (measured on the HD photos, size L / one size). */
export const PHOTO_VIEWS: Record<string, PhotoViewCalibration> = {
  "tshirt-front": {
    model: "CA6502",
    view: "front",
    photo: "https://static.gorfactory.es/images/models/6502/views/hd/p_6502_{c}_1_1.jpg",
    sizePx: 2000,
    centreXPx: 992,
    originYPx: 10,
    pxPerCm: 18.6,
    shadeColour: "01",
    maskColour: "02",
    colours: ["01", "02"],
    reliefPx: 5,
  },
  "tshirt-back": {
    model: "CA6502",
    view: "back",
    photo: "https://static.gorfactory.es/images/models/6502/views/hd/p_6502_{c}_2_1.jpg",
    sizePx: 2000,
    centreXPx: 1000,
    originYPx: -10,
    pxPerCm: 18.3,
    shadeColour: "01",
    maskColour: "02",
    colours: ["01", "02"],
    reliefPx: 5,
  },
  "polo-front": {
    model: "PO6632",
    view: "front",
    photo: "https://static.gorfactory.es/images/models/6632/views/hd/p_6632_{c}_1_1.jpg",
    sizePx: 2000,
    centreXPx: 1000,
    originYPx: 40,
    pxPerCm: 18.2,
    shadeColour: "01",
    maskColour: "02",
    colours: ["01", "02", "20", "55"],
    reliefPx: 5,
  },
  "polo-back": {
    model: "PO6632",
    view: "back",
    photo: "https://static.gorfactory.es/images/models/6632/views/hd/p_6632_{c}_2_1.jpg",
    sizePx: 2000,
    centreXPx: 1000,
    originYPx: 30,
    pxPerCm: 17.4,
    shadeColour: "01",
    maskColour: "02",
    colours: ["01", "02", "20", "55"],
    reliefPx: 5,
  },
  "cap-front": {
    model: "GO7019",
    view: "front",
    photo: "https://static.gorfactory.es/images/models/7019/views/hd/p_7019_{c}_1_1.jpg",
    sizePx: 2000,
    centreXPx: 1000,
    originYPx: 225,
    pxPerCm: 73,
    shadeColour: "01",
    maskColour: "02",
    colours: ["01", "02", "55", "60"],
    bow: 0.16,
    wrap: 0.55,
    reliefPx: 7,
  },
  // Baby bodysuit SWEET (BD7201): front only, small print. y = 0 at the neckline's bottom.
  "body-front": {
    model: "BD7201",
    view: "front",
    photo: "https://static.gorfactory.es/images/models/7201/views/hd/p_7201_{c}_1_1.jpg",
    sizePx: 2000,
    centreXPx: 990,
    originYPx: 330,
    pxPerCm: 38.5,
    shadeColour: "01",
    maskColour: "02",
    colours: ["01", "48"],
    reliefPx: 4,
  },
};

/** Views with photos. */
export const PHOTO_VIEW_KEYS = ["tshirt-front", "tshirt-back", "polo-front", "polo-back", "cap-front", "body-front"] as const;
export type PhotoViewKey = (typeof PHOTO_VIEW_KEYS)[number];

/** The photo view of a garment shape's side (null: no photo, the drawing is used). */
export function photoViewKey(shape: string, view: PhotoView): PhotoViewKey | null {
  const key = `${shape}-${view}`;
  return (PHOTO_VIEW_KEYS as readonly string[]).includes(key) ? (key as PhotoViewKey) : null;
}

/** Long side of the production assets (`public/studio/apparel/…`), px; calibration × this / `sizePx`. */
export const APPAREL_ASSET_PX = 1200;

/** Public URL of a view's colour photo (WebP, `APPAREL_ASSET_PX`). */
export function apparelPhotoAsset(cal: Pick<PhotoViewCalibration, "model" | "view">, colour: string): string {
  return `/studio/apparel/${cal.model}/${cal.view}-${colour}.webp`;
}

/** Public URL of a view's fabric maps (PNG: shade, displacement, cut-out; `encodeFabricMaps`). */
export function apparelMapsAsset(cal: Pick<PhotoViewCalibration, "model" | "view">): string {
  return `/studio/apparel/${cal.model}/${cal.view}-maps.png`;
}

/**
 * Supplier colour code of a shop colour key (the stock SKU: «CA6502-01»,
 * «GO70199060» = model + one-size 90 + colour 60): the longest of `codes`
 * the SKU ends with. Null when none (the colour has no photo).
 */
export function supplierColourCode(sku: string, codes: readonly string[]): string | null {
  const s: string = sku.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  let best: string | null = null;
  for (const c of codes) if (s.endsWith(c.toUpperCase()) && (!best || c.length > best.length)) best = c;
  return best;
}

/** The photo URL of a view in a colour. */
export function photoUrl(cal: PhotoViewCalibration, colour: string): string {
  return cal.photo.replace("{c}", colour);
}

/** A print box (garment cm, `apparelPrintBox`) → photo px, at a photo `scale` (photo width / `sizePx`). */
export function printBoxToPhotoPx(cal: PhotoViewCalibration, box: Pick<ApparelPrintBox, "x" | "y" | "w" | "h">, scale = 1): Rect {
  const k: number = cal.pxPerCm * scale;
  return { x: cal.centreXPx * scale + box.x * k, y: cal.originYPx * scale + box.y * k, w: box.w * k, h: box.h * k };
}

// ---------------------------------------------------------------------------
// Image maths

/** Luminance 0..1 of a rectangle of a raster (row-major, rect size). */
export function luminance(img: Raster, r: Rect): Float32Array {
  const out = new Float32Array(r.w * r.h);
  const d = img.data;
  for (let y = 0; y < r.h; y++) {
    const sy: number = Math.min(img.height - 1, Math.max(0, r.y + y));
    for (let x = 0; x < r.w; x++) {
      const sx: number = Math.min(img.width - 1, Math.max(0, r.x + x));
      const i: number = (sy * img.width + sx) * 4;
      out[y * r.w + x] = (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255;
    }
  }
  return out;
}

/** Box blur (separable, running sums, edges clamped), `passes` times ≈ Gaussian. */
export function blur(src: Float32Array, w: number, h: number, radius: number, passes = 2): Float32Array {
  const r: number = Math.max(0, Math.round(radius));
  if (r === 0) return src.slice();
  const a: Float32Array = src.slice();
  const b = new Float32Array(src.length);
  const n: number = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row: number = y * w;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[row + Math.min(w - 1, Math.max(0, k))]!;
      for (let x = 0; x < w; x++) {
        b[row + x] = s / n;
        s += a[row + Math.min(w - 1, x + r + 1)]! - a[row + Math.max(0, x - r)]!;
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += b[Math.min(h - 1, Math.max(0, k)) * w + x]!;
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / n;
        s += b[Math.min(h - 1, y + r + 1) * w + x]! - b[Math.max(0, y - r) * w + x]!;
      }
    }
  }
  return a;
}

function quantile(values: Float32Array, q: number): number {
  const step: number = Math.max(1, Math.floor(values.length / 4000));
  const sample: number[] = [];
  for (let i = 0; i < values.length; i += step) sample.push(values[i]!);
  sample.sort((x, y) => x - y);
  return sample[Math.min(sample.length - 1, Math.floor(q * sample.length))] ?? 0;
}

/** What the fabric does to a print over a rectangle of the photo. */
export interface FabricMaps {
  rect: Rect;
  /** Light on the fabric, 1 = average of the print area (multiply below 1, lift above). */
  shade: Float32Array;
  /** Displacement of the print (px): where each pixel samples the design from. */
  dx: Float32Array;
  dy: Float32Array;
  /** Fine knit texture, ±, around 0. */
  grain: Float32Array;
  /** 0..1: garment vs background (1 inside the garment). */
  mask: Float32Array;
}

/**
 * The garment cut-out from a dark photo on the white studio background:
 * grey raster, 255 inside, feathered over ~1 px (`scale` as below).
 */
export function garmentMask(dark: Raster, scale = 1): Raster {
  const full: Rect = { x: 0, y: 0, w: dark.width, h: dark.height };
  const M: Float32Array = luminance(dark, full);
  const m = new Float32Array(M.length);
  for (let i = 0; i < M.length; i++) m[i] = M[i]! < 0.8 ? 1 : 0;
  const soft: Float32Array = blur(m, dark.width, dark.height, Math.max(1, 1.5 * scale), 1);
  const data = new Uint8ClampedArray(M.length * 4);
  for (let i = 0; i < M.length; i++) {
    const v: number = Math.max(0, Math.min(1, (soft[i]! - 0.5) * 2.5 + 0.5)) * 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { width: dark.width, height: dark.height, data };
}

/** Bounding box of a mask's inside (value ≥ 128), padded, within the image. */
export function maskBounds(mask: Raster, pad = 0): Rect {
  let x0 = mask.width;
  let y0 = mask.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++)
      if (mask.data[(y * mask.width + x) * 4]! >= 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { x: 0, y: 0, w: mask.width, h: mask.height };
  const x: number = Math.max(0, x0 - pad);
  const y: number = Math.max(0, y0 - pad);
  return { x, y, w: Math.min(mask.width, x1 + 1 + pad) - x, h: Math.min(mask.height, y1 + 1 + pad) - y };
}

/**
 * Shading / relief / grain from the white photo and the cut-out (`garmentMask`),
 * over `rect` (the print box with some margin, or the whole garment). `scale` =
 * photo px per calibration px (1 for the HD photo, 0.6 for the 1200 px assets).
 */
export function buildFabricMaps(shadePhoto: Raster, mask: Raster | null, rect: Rect, opts: { reliefPx?: number; scale?: number; shadeBlurPx?: number } = {}): FabricMaps {
  const s: number = opts.scale ?? 1;
  const r: Rect = { x: Math.floor(rect.x), y: Math.floor(rect.y), w: Math.ceil(rect.w), h: Math.ceil(rect.h) };
  const { w, h } = r;
  const L: Float32Array = luminance(shadePhoto, r);
  const ref: number = Math.max(0.05, quantile(L, 0.6));
  // Assets: a smoother shade (the knit comes from the colour photo, `withPhotoGrain`) — compresses ~3× better.
  const smooth: Float32Array = blur(L, w, h, (opts.shadeBlurPx ?? 1.2) * s, 2);
  const shade = new Float32Array(w * h);
  // A touch more contrast than the photo: folds read better under a print.
  for (let i = 0; i < shade.length; i++) shade[i] = Math.min(1.22, Math.max(0.3, 1 + (smooth[i]! / ref - 1) * 1.25));
  // Relief: the low-frequency light of the white photo read as a height field
  // (darker = further away / inside a fold); its gradient bends the print.
  const height: Float32Array = blur(L, w, h, 16 * s, 3);
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i: number = y * w + x;
      gx[i] = (height[y * w + Math.min(w - 1, x + 1)]! - height[y * w + Math.max(0, x - 1)]!) / 2;
      gy[i] = (height[Math.min(h - 1, y + 1) * w + x]! - height[Math.max(0, y - 1) * w + x]!) / 2;
    }
  }
  // Absolute scale (not normalised): a flat panel stays flat, only real folds bend the print.
  // A strong fold on the HD white photo changes the light by ~0.004 per px.
  const relief: number = (opts.reliefPx ?? 5) * s;
  const k: number = relief / (0.004 / s);
  const dx = new Float32Array(w * h);
  const dy = new Float32Array(w * h);
  for (let i = 0; i < dx.length; i++) {
    dx[i] = Math.max(-relief, Math.min(relief, gx[i]! * k));
    dy[i] = Math.max(-relief, Math.min(relief, gy[i]! * k));
  }
  const fine: Float32Array = blur(L, w, h, 2 * s, 1);
  const grain = new Float32Array(w * h);
  for (let i = 0; i < grain.length; i++) grain[i] = (L[i]! - fine[i]!) / ref;
  const m: Float32Array = mask ? luminance(mask, r) : new Float32Array(w * h).fill(1);
  return { rect: r, shade, dx, dy, grain, mask: m };
}

/** Displacement range of the encoded maps (± px). */
const MAP_DISP_PX = 8;

/**
 * Maps as one RGBA image (the production asset): R = shade (0.3…1.3),
 * G / B = displacement x / y (±8 px), A = the cut-out. The knit grain is not
 * stored: it comes from the colour photo itself (`withPhotoGrain`).
 */
export function encodeFabricMaps(maps: FabricMaps): Raster {
  const n: number = maps.rect.w * maps.rect.h;
  const data = new Uint8ClampedArray(n * 4);
  const enc = (d: number): number => Math.round((Math.max(-MAP_DISP_PX, Math.min(MAP_DISP_PX, d)) / MAP_DISP_PX) * 127.5 + 127.5);
  for (let i = 0; i < n; i++) {
    const a: number = Math.round(maps.mask[i]! * 255);
    // Outside the garment nothing is printed: zeros compress best.
    if (a === 0) continue;
    data[i * 4] = Math.round((Math.max(0.3, Math.min(1.3, maps.shade[i]!)) - 0.3) * 255);
    data[i * 4 + 1] = enc(maps.dx[i]!);
    data[i * 4 + 2] = enc(maps.dy[i]!);
    data[i * 4 + 3] = a;
  }
  return { width: maps.rect.w, height: maps.rect.h, data };
}

/** The asset image back into maps over `rect` (where it sits on the photo); grain zero. */
export function decodeFabricMaps(img: Raster, rect: Pick<Rect, "x" | "y">): FabricMaps {
  const n: number = img.width * img.height;
  const shade = new Float32Array(n);
  const dx = new Float32Array(n);
  const dy = new Float32Array(n);
  const mask = new Float32Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const a: number = d[i * 4 + 3]!;
    mask[i] = a / 255;
    if (a === 0) {
      shade[i] = 1;
      continue;
    }
    shade[i] = d[i * 4]! / 255 + 0.3;
    dx[i] = ((d[i * 4 + 1]! - 127.5) / 127.5) * MAP_DISP_PX;
    dy[i] = ((d[i * 4 + 2]! - 127.5) / 127.5) * MAP_DISP_PX;
  }
  return { rect: { x: rect.x, y: rect.y, w: img.width, h: img.height }, shade, dx, dy, grain: new Float32Array(n), mask };
}

/**
 * Knit texture for a print over `box`, from the colour photo itself (its own
 * weave in that colour), written into `maps.grain` there. Small and quick: only
 * the box is filtered.
 */
export function withPhotoGrain(maps: FabricMaps, photo: Raster, box: Rect): FabricMaps {
  const r: Rect = maps.rect;
  const x0: number = Math.max(r.x, Math.floor(box.x) - 4);
  const y0: number = Math.max(r.y, Math.floor(box.y) - 4);
  const x1: number = Math.min(r.x + r.w, Math.ceil(box.x + box.w) + 4);
  const y1: number = Math.min(r.y + r.h, Math.ceil(box.y + box.h) + 4);
  if (x1 <= x0 || y1 <= y0) return maps;
  const sub: Rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const L: Float32Array = luminance(photo, sub);
  const fine: Float32Array = blur(L, sub.w, sub.h, 1.5, 1);
  const grain: Float32Array = maps.grain.slice();
  for (let y = 0; y < sub.h; y++)
    for (let x = 0; x < sub.w; x++) {
      const i: number = y * sub.w + x;
      // Relative to the local light, capped: JPEG noise on black must not turn into sparkles.
      const g: number = (L[i]! - fine[i]!) / Math.max(0.12, fine[i]!);
      grain[(y0 - r.y + y) * r.w + (x0 - r.x + x)] = Math.max(-0.12, Math.min(0.12, g));
    }
  return { ...maps, grain };
}

function sampleBilinear(img: Raster, u: number, v: number, out: Float32Array): void {
  if (u < -1 || v < -1 || u > img.width || v > img.height) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return;
  }
  const x0: number = Math.floor(u);
  const y0: number = Math.floor(v);
  const fx: number = u - x0;
  const fy: number = v - y0;
  out[0] = out[1] = out[2] = out[3] = 0;
  const d = img.data;
  for (let j = 0; j < 2; j++) {
    const yy: number = y0 + j;
    if (yy < 0 || yy >= img.height) continue;
    const wy: number = j ? fy : 1 - fy;
    for (let i = 0; i < 2; i++) {
      const xx: number = x0 + i;
      if (xx < 0 || xx >= img.width) continue;
      const wgt: number = wy * (i ? fx : 1 - fx);
      const k: number = (yy * img.width + xx) * 4;
      const a: number = (d[k + 3]! / 255) * wgt;
      // Premultiplied, so transparent edges do not bleed dark fringes.
      out[0] += (d[k]! / 255) * a;
      out[1] += (d[k + 1]! / 255) * a;
      out[2] += (d[k + 2]! / 255) * a;
      out[3] += a;
    }
  }
}

export interface PrintLook {
  /** Ink opacity (DTF film is opaque: ~0.97). */
  opacity?: number;
  /** How strongly the fabric light shows on the print, 0..1 (DTF ~0.85). */
  shadeAmount?: number;
  /** Knit texture showing through the print, 0..1. */
  grainAmount?: number;
  /** Curved surface: see `PhotoViewCalibration.bow` / `wrap`. */
  bow?: number;
  wrap?: number;
}

/**
 * Prints `design` (any size, stretched over `box`, photo px) onto `photo` in
 * place: bent by the fabric relief, lit by its shading, with a bit of knit
 * texture, cut to the garment. `maps` must cover `box` (built for a rect
 * around it).
 */
export function printOnPhoto(photo: Raster, maps: FabricMaps, design: Raster, box: Rect, look: PrintLook = {}): void {
  const opacity: number = look.opacity ?? 0.97;
  const shadeAmt: number = look.shadeAmount ?? 0.85;
  const grainAmt: number = look.grainAmount ?? 0.6;
  const bow: number = look.bow ?? 0;
  const wrap: number = Math.min(0.95, look.wrap ?? 0);
  const asinWrap: number = wrap > 0 ? Math.asin(wrap) : 1;
  const r: Rect = maps.rect;
  const px = new Float32Array(4);
  const x0: number = Math.max(r.x, Math.floor(box.x - 8));
  const y0: number = Math.max(r.y, Math.floor(box.y - 8));
  const x1: number = Math.min(r.x + r.w, Math.ceil(box.x + box.w + 8), photo.width);
  const y1: number = Math.min(r.y + r.h, Math.ceil(box.y + box.h + 8), photo.height);
  const su: number = design.width / box.w;
  const sv: number = design.height / box.h;
  const cx: number = box.x + box.w / 2;
  const d = photo.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const mi: number = (y - r.y) * r.w + (x - r.x);
      const m: number = maps.mask[mi]!;
      if (m <= 0) continue;
      let gx: number = x + maps.dx[mi]!;
      const gy: number = y + maps.dy[mi]!;
      let bowShift = 0;
      if (wrap > 0 || bow > 0) {
        // On a dome seen from the front: the sides are foreshortened (asin) and lines bow down.
        const nx: number = Math.max(-1, Math.min(1, (gx - cx) / (box.w / 2)));
        if (wrap > 0) gx = cx + (Math.asin(nx * wrap) / asinWrap) * (box.w / 2);
        bowShift = bow * box.h * nx * nx;
      }
      sampleBilinear(design, (gx - box.x) * su, (gy - box.y - bowShift) * sv, px);
      const a: number = px[3]! * opacity * m;
      if (a <= 0.002) continue;
      const shade: number = 1 + (maps.shade[mi]! - 1) * shadeAmt;
      const grain: number = maps.grain[mi]! * grainAmt;
      const k: number = (y * photo.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        // Un-premultiply, light like fabric: multiply in the shadows, lift (screen) in the highlights.
        let v: number = px[c]! / Math.max(1e-6, px[3]!);
        v = shade <= 1 ? v * shade : v + (1 - v) * (shade - 1) * 0.9;
        v = v * (1 + grain) + grain * 0.15;
        const out: number = Math.max(0, Math.min(1, v)) * 255;
        d[k + c] = d[k + c]! * (1 - a) + out * a;
      }
    }
  }
}

/** «#RRGGBB» → 0..1 floats. */
function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n: number = m ? parseInt(m[1]!, 16) : 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * A colour WITHOUT a supplier photo: the white photo recoloured to `hex`
 * (multiply over the flat colour, highlights lifted so dark colours keep their
 * folds), the background left white. Fallback only — the real photo of a
 * stocked colour is always better (fabric reflects differently per dye).
 */
export function recolourPhoto(white: Raster, mask: Raster, hex: string): Raster {
  const out: Raster = { width: white.width, height: white.height, data: new Uint8ClampedArray(white.data) };
  const full: Rect = { x: 0, y: 0, w: white.width, h: white.height };
  const L: Float32Array = luminance(white, full);
  const M: Float32Array = luminance(mask, full);
  const inside: number[] = [];
  for (let i = 0; i < L.length; i += 97) if (M[i]! > 0.5) inside.push(L[i]!);
  inside.sort((a, b) => a - b);
  const ref: number = inside[Math.floor(inside.length * 0.7)] ?? 0.9;
  const [cr, cg, cb] = hexRgb(hex);
  const lum: number = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
  // Dark dyes: stronger relative shading, else a black shirt looks like a flat cut-out.
  const gamma: number = 1 + (1 - lum) * 0.9;
  const lift: number = 0.1 * (1 - lum);
  for (let i = 0; i < L.length; i++) {
    const m: number = M[i]!;
    if (m <= 0) continue;
    const s: number = Math.pow(Math.max(0, L[i]! / ref), gamma);
    const k: number = i * 4;
    const rgb: [number, number, number] = [cr, cg, cb];
    for (let c = 0; c < 3; c++) {
      let v: number = rgb[c]! * Math.min(1, s);
      if (s > 1) v += (1 - v) * (s - 1) * 0.8;
      v += lift * (s - 0.8);
      d255(out.data, k + c, white.data[k + c]! * (1 - m) + Math.max(0, Math.min(1, v)) * 255 * m);
    }
  }
  return out;
}

function d255(d: Uint8ClampedArray, i: number, v: number): void {
  d[i] = v;
}
