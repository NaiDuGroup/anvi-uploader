import { applyPhotoColor, autoEnhanceParams, isIdentityEdit, photoEditKey, type PhotoEdit } from "./photoEdit";

/**
 * Photo adjustments on a canvas (browser): the photo turned / mirrored and
 * run through `applyPhotoColor`, at the resolution it is drawn at (rounded
 * up to a size step, never above the bitmap's own): a slider drag on a phone
 * works on a ~1000 px copy, the 300 dpi print on the original's pixels.
 * Results are cached per bitmap and edit (a redraw with the same edit is a
 * plain `drawImage`).
 */

type Source = CanvasImageSource & ({ width: number; height: number } | { naturalWidth: number; naturalHeight: number });

const STEPS: readonly number[] = [256, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192];
/** Cached edited copies per bitmap: the last ones (filter thumbnails, a slider drag), within a pixel budget. */
const PER_SOURCE = 16;
const PER_SOURCE_PX = 12_000_000;
const cache = new WeakMap<object, Map<string, HTMLCanvasElement | OffscreenCanvas>>();

function sizeOf(b: Source): { w: number; h: number } {
  const anyB = b as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  const w: number = anyB.naturalWidth || anyB.width || 0;
  const h: number = anyB.naturalHeight || anyB.height || 0;
  return { w, h };
}

/** Long side of the working copy for a photo drawn `drawnLongPx` long (step up, capped by the bitmap). */
export function editWorkSide(bitmapLong: number, drawnLongPx: number): number {
  const want: number = Math.max(1, Math.ceil(drawnLongPx * 1.15));
  const step: number = STEPS.find((s) => s >= want) ?? want;
  return Math.max(1, Math.min(bitmapLong, step));
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  return null;
}

/**
 * The photo with its edit applied, about `drawnLongPx` on its long side
 * (oriented: width / height already swapped for a quarter turn). The bitmap
 * itself when there is nothing to do.
 */
export function editedImage(bmp: CanvasImageSource, edit: PhotoEdit | null | undefined, drawnLongPx: number): CanvasImageSource {
  if (isIdentityEdit(edit) || !edit) return bmp;
  const { w: bw, h: bh } = sizeOf(bmp as Source);
  if (!(bw > 0 && bh > 0)) return bmp;
  const side: number = editWorkSide(Math.max(bw, bh), drawnLongPx);
  const key = `${side}|${photoEditKey(edit)}`;
  let per = cache.get(bmp as object);
  const hit = per?.get(key);
  if (hit) {
    // Most recently used last.
    per!.delete(key);
    per!.set(key, hit);
    return hit;
  }
  const k: number = side / Math.max(bw, bh);
  const sw: number = Math.max(1, Math.round(bw * k));
  const sh: number = Math.max(1, Math.round(bh * k));
  const turned: boolean = edit.rotate === 90 || edit.rotate === 270;
  const ow: number = turned ? sh : sw;
  const oh: number = turned ? sw : sh;
  const c = makeCanvas(ow, oh);
  const ctx = c?.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!c || !ctx) return bmp;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.translate(ow / 2, oh / 2);
  if (edit.rotate) ctx.rotate((edit.rotate * Math.PI) / 180);
  ctx.scale(edit.flipX ? -1 : 1, edit.flipY ? -1 : 1);
  ctx.drawImage(bmp, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
  try {
    const img = ctx.getImageData(0, 0, ow, oh);
    applyPhotoColor(img.data, ow, oh, edit);
    ctx.putImageData(img, 0, 0);
  } catch {
    // A tainted canvas (should not happen: photos are local blobs) keeps the turn / mirror only.
  }
  if (!per) {
    per = new Map();
    cache.set(bmp as object, per);
  }
  per.set(key, c);
  const px = (x: HTMLCanvasElement | OffscreenCanvas): number => x.width * x.height;
  let total: number = [...per.values()].reduce((a, x) => a + px(x), 0);
  while (per.size > 1 && (per.size > PER_SOURCE || total > PER_SOURCE_PX)) {
    const oldest: string = per.keys().next().value!;
    total -= px(per.get(oldest)!);
    per.delete(oldest);
  }
  return c;
}

/** «Auto-îmbunătățire» parameters measured on a ≤ 256 px copy of the photo. */
export function measureAutoEnhance(bmp: CanvasImageSource): Pick<PhotoEdit, "levels" | "sharpen" | "saturation"> | null {
  const { w, h } = sizeOf(bmp as Source);
  if (!(w > 0 && h > 0)) return null;
  const k: number = Math.min(1, 256 / Math.max(w, h));
  const cw: number = Math.max(1, Math.round(w * k));
  const ch: number = Math.max(1, Math.round(h * k));
  const c = makeCanvas(cw, ch);
  const ctx = c?.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, cw, ch);
  try {
    return autoEnhanceParams(ctx.getImageData(0, 0, cw, ch).data);
  } catch {
    return null;
  }
}
