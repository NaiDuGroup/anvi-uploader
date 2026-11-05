"use client";

import { photoPixelSize, type DrawablePhoto } from "./canvasPrimitives";

/**
 * Editor working copy of a photo: decoded off the main thread and downscaled
 * to what the print canvas can use. A 12 MP phone photo drawn into a pen's
 * ~470 × 180 px print canvas was decoded and resampled on the main thread on
 * every redraw (seconds on a phone). The print file is this same canvas, so a
 * copy that still covers it at `PRINT_MARGIN`× its pixel size loses nothing;
 * the original file (its URL) stays untouched for the upload.
 */

/** The working copy keeps at least this many source pixels per print pixel. */
export const PRINT_MARGIN = 2;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Size of the working copy for a `canvasW × canvasH` print canvas: the
 * smallest that still covers the whole canvas (any fit, any slot inside it)
 * at `PRINT_MARGIN`× — null when the photo is not larger than that.
 */
export function workingCopySize(
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
  margin: number = PRINT_MARGIN,
): { w: number; h: number } | null {
  if (!(imgW > 0 && imgH > 0 && canvasW > 0 && canvasH > 0)) return null;
  const k: number = Math.max(canvasW / imgW, canvasH / imgH) * margin;
  if (k >= 1) return null;
  return { w: Math.max(1, Math.ceil(imgW * k)), h: Math.max(1, Math.ceil(imgH * k)) };
}

/** The photo at `src` ready to draw into a `canvasW × canvasH` print canvas. */
export async function loadWorkingPhoto(src: string, canvasW: number, canvasH: number): Promise<DrawablePhoto> {
  const img: HTMLImageElement = await loadImg(src);
  const { w, h } = photoPixelSize(img);
  const size = workingCopySize(w, h, canvasW, canvasH);
  if (!size || typeof createImageBitmap !== "function") return img;
  try {
    // Decode + resample in the browser's image threads, not in a redraw.
    const bmp: ImageBitmap = await createImageBitmap(img, {
      resizeWidth: size.w,
      resizeHeight: size.h,
      resizeQuality: "high",
    });
    // A browser that ignores the resize options returns the full size: keep the <img> then.
    if (bmp.width !== size.w || bmp.height !== size.h) {
      bmp.close();
      return img;
    }
    return bmp;
  } catch {
    return img;
  }
}
