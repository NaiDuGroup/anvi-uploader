"use client";

import { useEffect, useState } from "react";
import { findInkBox, inkBoxCm } from "./inkBox";
import { readLocalFileMeta } from "./localFileMeta";

/** Analysed image long side (px): enough for a 0.1 cm answer on a print, fast in the browser. */
const MAX_SIDE = 1500;
const RASTER_RE = /\.(png|jpe?g|webp)$/i;
const RASTER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface LocalInkBox {
  widthCm: number;
  heightCm: number;
  /** The file has no dpi: the size is at 300 dpi. */
  assumedDpi: boolean;
  whiteBackground: boolean;
}

function isRaster(file: File): boolean {
  return RASTER_TYPES.has(file.type) || RASTER_RE.test(file.name);
}

/**
 * Ink bounding box of a PNG / JPEG / WebP in cm (null for PDFs and other files,
 * images without ink, or when the box is the whole image). Browser only.
 */
export async function readLocalInkBox(file: File): Promise<LocalInkBox | null> {
  if (!isRaster(file) || typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  const [meta, bitmap] = await Promise.all([readLocalFileMeta(file), createImageBitmap(file)]);
  try {
    const long = Math.max(bitmap.width, bitmap.height);
    const k = long > MAX_SIDE ? MAX_SIDE / long : 1;
    const w = Math.max(1, Math.round(bitmap.width * k));
    const h = Math.max(1, Math.round(bitmap.height * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const found = findInkBox(ctx.getImageData(0, 0, w, h));
    if (!found.box || found.fullBleed) return null;
    const dpi = meta.dpi && meta.dpi > 0 ? meta.dpi : 300;
    // Original pixels per analysed pixel (header size when known: EXIF-rotated JPEGs keep it right).
    const scale = (meta.pixelWidth ?? bitmap.width) / w;
    return {
      ...inkBoxCm(found.box, scale, dpi),
      assumedDpi: !(meta.dpi && meta.dpi > 0),
      whiteBackground: found.whiteBackground,
    };
  } finally {
    bitmap.close();
  }
}

const cache = new WeakMap<File, Promise<LocalInkBox | null>>();

/** Ink box of a picked file, or of a stored one fetched from `url` (null while reading / none). */
export function useInkBox(file: File | null | undefined, url?: string | null, fileName?: string | null): LocalInkBox | null {
  const [state, setState] = useState<{ key: File | string; box: LocalInkBox | null } | null>(null);
  const key: File | string | null = file ?? url ?? null;
  useEffect(() => {
    if (!key) return;
    let alive = true;
    let job: Promise<LocalInkBox | null>;
    if (key instanceof File) {
      job = cache.get(key) ?? readLocalInkBox(key);
      cache.set(key, job);
    } else {
      // Only rasters are worth downloading.
      if (!fileName || !RASTER_RE.test(fileName)) return;
      job = fetch(key)
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => (b ? readLocalInkBox(new File([b], fileName, { type: b.type })) : null));
    }
    job.then(
      (box) => alive && setState({ key, box }),
      () => alive && setState({ key, box: null }),
    );
    return () => {
      alive = false;
    };
  }, [key, fileName]);
  return key && state?.key === key ? state.box : null;
}
