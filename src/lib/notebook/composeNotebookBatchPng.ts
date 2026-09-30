/**
 * Browser-side composer that glues 2–4 notebook cover images into a single
 * side-by-side PNG for batch printing on the UV flatbed. Runs entirely in the
 * browser via `createImageBitmap` + `<canvas>` — no server round trip.
 *
 * Notebook print files are PNG at 300 DPI (A5 hardcover default: 1654×2528).
 * A 4-tile batch is therefore ≈ 6616×2528 (≈16 MP), well within the safe
 * canvas size on every modern browser. Tiles are drawn tightly packed with
 * zero horizontal gap so the UV printer can lay four physical notebooks flush
 * against each other on the bed.
 */

import { DEFAULT_DPI } from "@/lib/printDimensions";
import {
  dpiToPixelsPerMeter,
  injectPngPhysChunk,
  readSourceDpiFromFile,
} from "@/lib/notebook/pngPhysChunk";

export const NOTEBOOK_BATCH_MIN_FILES = 2;
export const NOTEBOOK_BATCH_MAX_FILES = 4;
/** Accepted MIME types for input tiles. */
export const NOTEBOOK_BATCH_ACCEPT_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
];

export interface NotebookBatchTile {
  /** Zero-based drop index (used for error messages / UI). */
  index: number;
  /** Source pixel size — mirrored on the tile before it's placed. */
  widthPx: number;
  heightPx: number;
  /** Horizontal offset in the combined canvas (pixels). */
  offsetXPx: number;
}

export interface ComposeNotebookBatchResult {
  blob: Blob;
  /** Suggested MIME — always `image/png` in v1. */
  mimeType: "image/png";
  widthPx: number;
  heightPx: number;
  /** Print DPI written into the PNG `pHYs` chunk (source DPI or 300). */
  dpi: number;
  tiles: NotebookBatchTile[];
}

export interface ComposeNotebookBatchOptions {
  /**
   * Optional fill for empty vertical space when tile heights differ.
   * When omitted the canvas stays fully transparent so source alpha
   * (rounded notebook corners) is preserved.
   */
  backgroundColor?: string;
}

/**
 * Load a `File` into an `ImageBitmap`. `createImageBitmap` respects EXIF
 * rotation and is dramatically faster than `<img>.decode()` for large PNGs.
 * Falls back to the `<img>` path only when the API is unavailable (older
 * browsers). All notebook print files are PNG/JPEG so no format check is
 * needed here.
 */
async function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // The <img> keeps a reference until it's garbage-collected; revoking here
    // is safe because decode() has already parsed the pixels.
    URL.revokeObjectURL(url);
  }
}

function disposeBitmap(bitmap: ImageBitmap | HTMLImageElement): void {
  if (typeof ImageBitmap !== "undefined" && bitmap instanceof ImageBitmap) {
    bitmap.close?.();
  }
}

function bitmapSize(bitmap: ImageBitmap | HTMLImageElement): {
  width: number;
  height: number;
} {
  return {
    width: bitmap.width,
    height: bitmap.height,
  };
}

/**
 * Compose `files` into a single side-by-side PNG. Height = max of all inputs;
 * width = sum of all inputs. Shorter tiles are top-aligned; leftover vertical
 * space stays transparent unless `backgroundColor` is set.
 */
export async function composeNotebookBatchPng(
  files: readonly File[],
  options: ComposeNotebookBatchOptions = {},
): Promise<ComposeNotebookBatchResult> {
  if (files.length < NOTEBOOK_BATCH_MIN_FILES) {
    throw new Error(
      `Need at least ${NOTEBOOK_BATCH_MIN_FILES} files, got ${files.length}`,
    );
  }
  if (files.length > NOTEBOOK_BATCH_MAX_FILES) {
    throw new Error(
      `Cannot combine more than ${NOTEBOOK_BATCH_MAX_FILES} files, got ${files.length}`,
    );
  }

  const sourceDpi = (await readSourceDpiFromFile(files[0]!)) ?? DEFAULT_DPI;

  const bitmaps: Array<ImageBitmap | HTMLImageElement> = [];
  try {
    for (const file of files) {
      bitmaps.push(await loadImageBitmap(file));
    }

    const sizes = bitmaps.map(bitmapSize);
    const totalWidth = sizes.reduce((sum, s) => sum + s.width, 0);
    const maxHeight = sizes.reduce((max, s) => Math.max(max, s.height), 0);
    if (totalWidth === 0 || maxHeight === 0) {
      throw new Error("One of the images has zero dimensions");
    }

    const canvas = document.createElement("canvas");
    canvas.width = totalWidth;
    canvas.height = maxHeight;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      throw new Error("2D canvas context is unavailable");
    }

    // Preserve print sharpness — nearest-neighbour scaling is fine because
    // we never actually resize tiles here (they're placed 1:1). The setting
    // still helps avoid subtle blurring on some renderers.
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, totalWidth, maxHeight);
    if (options.backgroundColor) {
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, totalWidth, maxHeight);
    }

    const tiles: NotebookBatchTile[] = [];
    let cursorX = 0;
    for (let i = 0; i < bitmaps.length; i += 1) {
      const bitmap = bitmaps[i]!;
      const { width, height } = sizes[i]!;
      ctx.drawImage(bitmap, cursorX, 0, width, height);
      tiles.push({
        index: i,
        widthPx: width,
        heightPx: height,
        offsetXPx: cursorX,
      });
      cursorX += width;
    }

    const rawBlob = await canvasToPngBlob(canvas);
    const rawBytes = new Uint8Array(await rawBlob.arrayBuffer());
    const ppm = dpiToPixelsPerMeter(sourceDpi);
    const withDpi = injectPngPhysChunk(rawBytes, ppm, ppm);
    const blob = new Blob([toArrayBuffer(withDpi)], { type: "image/png" });
    return {
      blob,
      mimeType: "image/png",
      widthPx: totalWidth,
      heightPx: maxHeight,
      dpi: sourceDpi,
      tiles,
    };
  } finally {
    for (const bitmap of bitmaps) disposeBitmap(bitmap);
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

/**
 * Wrap the callback-based `canvas.toBlob` in a promise. `type: "image/png"`
 * is lossless — critical because these files go straight to the UV printer.
 */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("canvas.toBlob returned null"));
          return;
        }
        resolve(blob);
      },
      "image/png",
    );
  });
}

/**
 * Trigger a browser download for a Blob. Kept here so both the tool component
 * and any future callers use the same revoke-after-click pattern.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Give the browser a beat to actually start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
