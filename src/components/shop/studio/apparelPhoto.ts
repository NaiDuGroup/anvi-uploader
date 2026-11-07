"use client";

/**
 * Photo garments of the apparel Studio (browser side): loads a view's
 * pre-processed assets (`public/studio/apparel/…`, `scripts/apparelPhotoAssets.ts`)
 * — the colour photo and the fabric maps — and prints designs on it
 * (`photoMockup.ts`). A colour without its own photo is the white photo
 * recoloured. Everything is cached per URL; null = no photo for that view
 * (or it failed to load): the caller falls back to the drawn garment.
 */
import { APPAREL_PHOTO_ASSETS } from "@/lib/studio/apparelPhotoAssets.gen";
import type { ApparelPrintBox, ApparelView } from "@/lib/studio/apparelMockup";
import {
  APPAREL_ASSET_PX,
  PHOTO_VIEWS,
  apparelMapsAsset,
  apparelPhotoAsset,
  decodeFabricMaps,
  photoViewKey,
  printBoxToPhotoPx,
  printOnPhoto,
  recolourPhoto,
  supplierColourCode,
  withPhotoGrain,
  type FabricMaps,
  type PhotoViewCalibration,
  type PhotoViewKey,
  type Raster,
  type Rect,
} from "@/lib/studio/photoMockup";

export interface ApparelPhotoView {
  key: PhotoViewKey;
  cal: PhotoViewCalibration;
  /** Asset px per calibration px. */
  scale: number;
  /** The garment photo in the picked colour (no print). */
  photo: Raster;
  /** The same, cut out (transparent around the garment), as a canvas: the editor backdrop. */
  canvas: HTMLCanvasElement;
  maps: FabricMaps;
  /** Garment bounds on the photo (asset px). */
  garment: Rect;
  /** The colour is the white photo recoloured (no supplier photo of it). */
  recoloured: boolean;
}

const rasters = new Map<string, Promise<Raster>>();

/** An image URL (same origin / data URL) as pixels, cached. */
export function loadRaster(url: string): Promise<Raster> {
  let p = rasters.get(url);
  if (!p) {
    p = new Promise<Raster>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return reject(new Error("no 2d context"));
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        resolve({ width: d.width, height: d.height, data: d.data });
      };
      img.onerror = () => reject(new Error(`image failed: ${url.slice(0, 80)}`));
      img.src = url;
    });
    // Data URLs (prints) change with every edit: keep only the few latest.
    if (url.startsWith("data:")) {
      for (const k of rasters.keys()) if (k.startsWith("data:") && rasters.size > 24) rasters.delete(k);
    }
    p.catch(() => rasters.delete(url));
    rasters.set(url, p);
  }
  return p;
}

export function rasterCanvas(r: Raster, canvas: HTMLCanvasElement = document.createElement("canvas")): HTMLCanvasElement {
  canvas.width = r.width;
  canvas.height = r.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const id = ctx.createImageData(r.width, r.height);
    id.data.set(r.data);
    ctx.putImageData(id, 0, 0);
  }
  return canvas;
}

const views = new Map<string, Promise<ApparelPhotoView | null>>();

/** A view's photo in a shop colour (`key` = the stock SKU, `hex` for the recolour fallback). */
export function loadApparelPhotoView(shape: string, view: ApparelView, colour: { key: string; hex: string }): Promise<ApparelPhotoView | null> {
  const key: PhotoViewKey | null = photoViewKey(shape, view);
  if (!key) return Promise.resolve(null);
  const id = `${key}|${colour.key}|${colour.hex}`;
  let p = views.get(id);
  if (!p) {
    p = (async (): Promise<ApparelPhotoView | null> => {
      const cal: PhotoViewCalibration = PHOTO_VIEWS[key]!;
      const asset = APPAREL_PHOTO_ASSETS[key];
      const code: string | null = supplierColourCode(colour.key, cal.colours);
      const [mapsImg, base] = await Promise.all([loadRaster(apparelMapsAsset(cal)), loadRaster(apparelPhotoAsset(cal, code ?? cal.shadeColour))]);
      const maps: FabricMaps = decodeFabricMaps(mapsImg, asset.maps);
      const photo: Raster = code ? base : recolourPhoto(base, maskRaster({ maps, size: base.width }), colour.hex);
      return { key, cal, scale: APPAREL_ASSET_PX / cal.sizePx, photo, canvas: rasterCanvas(cutOut(photo, maps)), maps, garment: asset.garment, recoloured: !code };
    })().catch((e: unknown) => {
      console.warn("[studio] apparel photo unavailable, drawn garment used:", e);
      views.delete(id);
      return null;
    });
    views.set(id, p);
  }
  return p;
}

/** A photo with the studio background made transparent (alpha = the garment cut-out). */
export function cutOut(photo: Raster, maps: FabricMaps): Raster {
  const out: Raster = { width: photo.width, height: photo.height, data: new Uint8ClampedArray(photo.data) };
  const r: Rect = maps.rect;
  for (let y = 0; y < photo.height; y++)
    for (let x = 0; x < photo.width; x++) {
      const inR: boolean = x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
      out.data[(y * photo.width + x) * 4 + 3] = inR ? Math.round(maps.mask[(y - r.y) * r.w + (x - r.x)]! * 255) : 0;
    }
  return out;
}

/** The garment cut-out over the whole photo (grey, 255 inside), from the maps' alpha. */
export function maskRaster(v: { maps: FabricMaps; size: number }): Raster {
  const n: number = v.size;
  const data = new Uint8ClampedArray(n * n * 4);
  const r: Rect = v.maps.rect;
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const m: number = v.maps.mask[y * r.w + x]! * 255;
      const k: number = ((r.y + y) * n + (r.x + x)) * 4;
      data[k] = data[k + 1] = data[k + 2] = m;
    }
  return { width: n, height: n, data };
}

export interface ApparelPhotoPrint {
  /** Where the transfer sits (garment cm). */
  box: Pick<ApparelPrintBox, "x" | "y" | "w" | "h">;
  /** The transfer as printed (transparent). */
  art: Raster;
}

/** The view's photo with the prints on it (asset size). Pure pixels; ~10–60 ms for a chest print. */
export function composeApparelPhoto(v: ApparelPhotoView, prints: readonly ApparelPhotoPrint[]): Raster {
  const out: Raster = { width: v.photo.width, height: v.photo.height, data: new Uint8ClampedArray(v.photo.data) };
  for (const p of prints) {
    const box: Rect = printBoxToPhotoPx(v.cal, p.box, v.scale);
    printOnPhoto(out, withPhotoGrain(v.maps, v.photo, box), p.art, box, { bow: v.cal.bow, wrap: v.cal.wrap });
  }
  return out;
}

/** Where the photo lies in garment cm (the backdrop of the editor canvas), and the garment's bounds. */
export function photoGarmentCm(v: ApparelPhotoView): { image: Rect; garment: Rect } {
  const k: number = v.cal.pxPerCm * v.scale;
  const toCm = (r: Rect): Rect => ({ x: (r.x - v.cal.centreXPx * v.scale) / k, y: (r.y - v.cal.originYPx * v.scale) / k, w: r.w / k, h: r.h / k });
  return { image: toCm({ x: 0, y: 0, w: v.photo.width, h: v.photo.height }), garment: toCm(v.garment) };
}

/**
 * A JPEG data URL of a canvas on the photo's white, long side `maxSide`, as
 * small as it must be (cart lines keep ≤ 75 kB): the cart / «added» picture.
 */
export function canvasJpeg(src: HTMLCanvasElement, maxSide: number, qualities: readonly number[] = [0.82, 0.7, 0.58]): string | null {
  const k: number = maxSide / Math.max(src.width, src.height);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width * k));
  c.height = Math.max(1, Math.round(src.height * k));
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  for (const q of qualities) {
    const out: string = c.toDataURL("image/jpeg", q);
    if (out.length <= 75_000) return out;
  }
  return null;
}
