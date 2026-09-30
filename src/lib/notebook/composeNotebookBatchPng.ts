"use strict";

/**
 * Browser-side composer that lays 2-8 notebook cover images onto a single
 * UV-flatbed PNG. Runs entirely in the browser via `createImageBitmap` +
 * `<canvas>` — no server round trip.
 *
 * Layout is a 4-column grid with **asymmetric** gaps: 0.5 cm between columns
 * (short side of the notebook) and 1 cm between rows (long side, where the
 * UV head travels). No outer padding — the operator sets the origin offset
 * inside the UV printer software, so the PNG only carries the grid itself.
 * Slot dimensions come from the biggest source tile so that A5 files
 * (1654 x 2528 @ 300 DPI) tile 1:1, and any smaller tile sits top-left
 * inside its slot with transparent padding on the right / bottom.
 *
 * Gaps are defined in centimetres (`NOTEBOOK_GAP_H_CM` / `NOTEBOOK_GAP_V_CM`)
 * and converted to pixels at the *source* DPI so the physical gaps stay
 * exact even for a lower-resolution source (e.g. legacy 150 DPI files). The
 * output PNG carries a `pHYs` chunk matching that DPI.
 */

import { DEFAULT_DPI, cmToPx } from "@/lib/printDimensions";
import {
  dpiToPixelsPerMeter,
  injectPngPhysChunk,
  readSourceDpiFromFile,
} from "@/lib/notebook/pngPhysChunk";

// ─── Public constants ───────────────────────────────────────────────────────

export const NOTEBOOK_BATCH_MIN_FILES = 2;
/** Bumped from 4 to 8 (2026-09) — grid 4x2 fits the UV bed. */
export const NOTEBOOK_BATCH_MAX_FILES = 8;
/** Notebooks are laid 4 across per row; extras wrap into a second row. */
export const NOTEBOOK_BATCH_COLS = 4;
/**
 * Horizontal gap between neighbouring columns (short side of the notebook).
 * 0.5 cm is enough clearance between the short sides of two A5 notebooks —
 * saves ~1.5 cm of table width across the 4-column grid.
 */
export const NOTEBOOK_GAP_H_CM = 0.5;
/**
 * Vertical gap between rows (long side of the notebook, where the UV head
 * travels). Kept at 1 cm — the operator wants full head clearance between
 * rows even though 0.5 cm is enough between short sides.
 */
export const NOTEBOOK_GAP_V_CM = 1;

/** Accepted MIME types for input tiles. */
export const NOTEBOOK_BATCH_ACCEPT_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NotebookBatchTile {
  /** Zero-based drop index. */
  index: number;
  row: number;
  col: number;
  /** Slot origin inside the composed canvas (pixels). */
  offsetXPx: number;
  offsetYPx: number;
  /** Actual source dimensions at 1:1 — drawn top-left into the slot. */
  widthPx: number;
  heightPx: number;
}

export interface NotebookBatchGrid {
  cols: number;
  rows: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  slots: NotebookBatchTile[];
}

export interface ComposeNotebookBatchResult {
  blob: Blob;
  mimeType: "image/png";
  widthPx: number;
  heightPx: number;
  /** Print DPI written into the PNG `pHYs` chunk (source DPI or 300). */
  dpi: number;
  grid: NotebookBatchGrid;
  /** Kept for backwards compat with earlier v1 callers that used `tiles`. */
  tiles: NotebookBatchTile[];
}

export interface ComposeNotebookBatchOptions {
  /**
   * Optional fill for transparent slot padding (e.g. when one tile is
   * smaller than the slot). Left unset the canvas stays fully transparent
   * so source alpha (rounded notebook corners, transparent bleed) is
   * preserved.
   */
  backgroundColor?: string;
}

// ─── Pure grid math ────────────────────────────────────────────────────────

/**
 * Compute slot positions for a `count`-tile batch. Kept side-effect free so
 * it can drive both the actual compose step *and* the UI preview footer (the
 * latter has to run before any file has been drawn on a real canvas).
 */
export function computeNotebookBatchGrid(params: {
  count: number;
  slotWidthPx: number;
  slotHeightPx: number;
  gapHPx: number;
  gapVPx: number;
}): NotebookBatchGrid {
  const { count, slotWidthPx, slotHeightPx, gapHPx, gapVPx } = params;
  if (!Number.isInteger(count)) {
    throw new Error(`Notebook count must be an integer, got ${count}`);
  }
  if (count < NOTEBOOK_BATCH_MIN_FILES || count > NOTEBOOK_BATCH_MAX_FILES) {
    throw new Error(
      `Notebook count must be between ${NOTEBOOK_BATCH_MIN_FILES} and ${NOTEBOOK_BATCH_MAX_FILES}, got ${count}`,
    );
  }
  if (slotWidthPx <= 0 || slotHeightPx <= 0) {
    throw new Error(
      `Slot dimensions must be positive, got ${slotWidthPx}x${slotHeightPx}`,
    );
  }
  if (gapHPx < 0 || gapVPx < 0) {
    throw new Error(`Gaps must be non-negative, got ${gapHPx}/${gapVPx}`);
  }

  const cols = Math.min(NOTEBOOK_BATCH_COLS, count);
  const rows = Math.ceil(count / NOTEBOOK_BATCH_COLS);

  const stepH = slotWidthPx + gapHPx;
  const stepV = slotHeightPx + gapVPx;

  const slots: NotebookBatchTile[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / NOTEBOOK_BATCH_COLS);
    const col = i % NOTEBOOK_BATCH_COLS;
    slots.push({
      index: i,
      row,
      col,
      offsetXPx: col * stepH,
      offsetYPx: row * stepV,
      widthPx: slotWidthPx,
      heightPx: slotHeightPx,
    });
  }

  const canvasWidthPx =
    cols * slotWidthPx + Math.max(0, cols - 1) * gapHPx;
  const canvasHeightPx =
    rows * slotHeightPx + Math.max(0, rows - 1) * gapVPx;

  return { cols, rows, canvasWidthPx, canvasHeightPx, slots };
}

// ─── DOM helpers ───────────────────────────────────────────────────────────

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

// ─── Compose ───────────────────────────────────────────────────────────────

/**
 * Compose `files` into a single grid PNG (4-column, up to 2 rows). Each slot
 * is sized to the largest source tile so identical A5 files (the common
 * case) tile perfectly. Shorter / narrower tiles sit top-left in their slot
 * — leftover space stays transparent unless `backgroundColor` is set.
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
  const gapHPx = cmToPx(NOTEBOOK_GAP_H_CM, sourceDpi);
  const gapVPx = cmToPx(NOTEBOOK_GAP_V_CM, sourceDpi);

  const bitmaps: Array<ImageBitmap | HTMLImageElement> = [];
  try {
    for (const file of files) {
      bitmaps.push(await loadImageBitmap(file));
    }

    const sizes = bitmaps.map(bitmapSize);
    const slotWidthPx = sizes.reduce((max, s) => Math.max(max, s.width), 0);
    const slotHeightPx = sizes.reduce((max, s) => Math.max(max, s.height), 0);
    if (slotWidthPx === 0 || slotHeightPx === 0) {
      throw new Error("One of the images has zero dimensions");
    }

    const grid = computeNotebookBatchGrid({
      count: files.length,
      slotWidthPx,
      slotHeightPx,
      gapHPx,
      gapVPx,
    });

    const canvas = document.createElement("canvas");
    canvas.width = grid.canvasWidthPx;
    canvas.height = grid.canvasHeightPx;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      throw new Error("2D canvas context is unavailable");
    }

    // Preserve print sharpness — nearest-neighbour scaling is fine because
    // we never actually resize tiles here (they're placed 1:1). The setting
    // still helps avoid subtle blurring on some renderers.
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, grid.canvasWidthPx, grid.canvasHeightPx);
    if (options.backgroundColor) {
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, grid.canvasWidthPx, grid.canvasHeightPx);
    }

    const tiles: NotebookBatchTile[] = [];
    for (let i = 0; i < bitmaps.length; i += 1) {
      const bitmap = bitmaps[i]!;
      const { width, height } = sizes[i]!;
      const slot = grid.slots[i]!;
      // Draw at 1:1 top-left inside the slot. If the tile is smaller than
      // slotWidth/slotHeight the remainder stays transparent (or filled by
      // backgroundColor option).
      ctx.drawImage(bitmap, slot.offsetXPx, slot.offsetYPx, width, height);
      tiles.push({
        index: i,
        row: slot.row,
        col: slot.col,
        offsetXPx: slot.offsetXPx,
        offsetYPx: slot.offsetYPx,
        widthPx: width,
        heightPx: height,
      });
    }

    const rawBlob = await canvasToPngBlob(canvas);
    const rawBytes = new Uint8Array(await rawBlob.arrayBuffer());
    const ppm = dpiToPixelsPerMeter(sourceDpi);
    const withDpi = injectPngPhysChunk(rawBytes, ppm, ppm);
    const blob = new Blob([toArrayBuffer(withDpi)], { type: "image/png" });
    return {
      blob,
      mimeType: "image/png",
      widthPx: grid.canvasWidthPx,
      heightPx: grid.canvasHeightPx,
      dpi: sourceDpi,
      grid,
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
