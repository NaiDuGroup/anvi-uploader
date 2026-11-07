"use client";

/**
 * Browser side of the photo mockup (prototype): loads the supplier photos
 * (public, CORS *), prints a design with `photoMockup.ts` and returns canvases.
 * This is what the Studio backdrop / verify step / cart thumbnail would call.
 */
import { PHOTO_VIEWS, buildFabricMaps, photoUrl, printBoxToPhotoPx, printOnPhoto, type PhotoViewCalibration, type Raster, type Rect } from "@/lib/studio/photoMockup";

const images = new Map<string, Promise<Raster>>();

/** A photo as pixels (cached per URL). */
export function loadRaster(url: string): Promise<Raster> {
  let p = images.get(url);
  if (!p) {
    p = new Promise<Raster>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        resolve({ width: d.width, height: d.height, data: d.data });
      };
      img.onerror = () => reject(new Error(`photo failed: ${url}`));
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

export function rasterToCanvas(r: Raster, canvas: HTMLCanvasElement = document.createElement("canvas")): HTMLCanvasElement {
  canvas.width = r.width;
  canvas.height = r.height;
  const ctx = canvas.getContext("2d")!;
  const id = ctx.createImageData(r.width, r.height);
  id.data.set(r.data);
  ctx.putImageData(id, 0, 0);
  return canvas;
}

export interface PhotoPrint {
  /** Garment cm box (`apparelPrintBox`). */
  cm: { x: number; y: number; w: number; h: number };
  /** The artwork (any canvas, stretched over the box). */
  art: HTMLCanvasElement;
}

/** The colour photo of a view with the prints on it, plus timings (ms). */
export async function renderPhotoMockup(viewId: keyof typeof PHOTO_VIEWS | string, colour: string, prints: PhotoPrint[]): Promise<{ raster: Raster; ms: number; boxes: Rect[] }> {
  const cal: PhotoViewCalibration = PHOTO_VIEWS[viewId]!;
  const [base, white, dark] = await Promise.all([loadRaster(photoUrl(cal, colour)), loadRaster(photoUrl(cal, cal.shadeColour)), loadRaster(photoUrl(cal, cal.maskColour))]);
  const t0: number = performance.now();
  const scale: number = base.width / cal.sizePx;
  const out: Raster = { width: base.width, height: base.height, data: new Uint8ClampedArray(base.data) };
  const boxes: Rect[] = [];
  for (const p of prints) {
    const box: Rect = printBoxToPhotoPx(cal, p.cm, scale);
    const pad: number = 24 * scale;
    const maps = buildFabricMaps(white, dark, { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad }, { reliefPx: cal.reliefPx, scale });
    const ctx = p.art.getContext("2d", { willReadFrequently: true })!;
    const d = ctx.getImageData(0, 0, p.art.width, p.art.height);
    printOnPhoto(out, maps, { width: d.width, height: d.height, data: d.data }, box, { bow: cal.bow, wrap: cal.wrap });
    boxes.push(box);
  }
  return { raster: out, ms: performance.now() - t0, boxes };
}
