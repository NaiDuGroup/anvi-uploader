/**
 * Browser-side composer that lays 2-12 pen artwork PNGs onto the UV flatbed
 * jig grid. Each pen file is expected to be 591 x 71 px (5 cm x 0.6 cm at
 * 300 DPI). Tiles sit in a fixed 3-column grid with hard-coded gaps that
 * mirror the physical jig:
 *
 *   * gap between pens (horizontal): 13.4 cm = 1583 px
 *   * gap between rows (vertical):   2.910 cm = 344 px
 *
 * The origin offset (5.5 cm, 3 cm) shown in the UV printer software is
 * applied by the operator inside the printer's own layout dialog, so the
 * PNG we produce contains only the pen grid itself. The result is
 * transparent (source alpha preserved) and carries a `pHYs` chunk so the
 * printer software reads the file as 300 DPI, not 72.
 */

import {
  buildBatchFileName,
  type ParsedNotebookFileName,
} from "@/lib/notebook/parseNotebookColorFromFileName";
import {
  dpiToPixelsPerMeter,
  injectPngPhysChunk,
} from "@/lib/notebook/pngPhysChunk";

/** DPI of the pen jig geometry. Also written into the output `pHYs` chunk. */
export const PEN_BATCH_DPI = 300;
/** Fixed pen slot: 5 cm x 0.6 cm at 300 DPI. */
export const PEN_SLOT_WIDTH_PX = 591;
export const PEN_SLOT_HEIGHT_PX = 71;
/** Empty space between adjacent pens on the jig. */
export const PEN_GAP_H_PX = 1583; // 13.4 cm
export const PEN_GAP_V_PX = 344; // 2.910 cm
/** Physical jig accepts 3 pens per row; the tool goes up to 4 rows. */
export const PEN_BATCH_COLS = 3;
export const PEN_BATCH_MIN_FILES = 2;
export const PEN_BATCH_MAX_FILES = 12;

/** Accepted MIME types for input tiles. */
export const PEN_BATCH_ACCEPT_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
];

/** Step between two adjacent tile origins along each axis. */
const PEN_STEP_H_PX = PEN_SLOT_WIDTH_PX + PEN_GAP_H_PX; // 2174
const PEN_STEP_V_PX = PEN_SLOT_HEIGHT_PX + PEN_GAP_V_PX; // 415

export interface PenBatchSlot {
  /** Zero-based drop index (mirrors the operator's ordering). */
  index: number;
  row: number;
  col: number;
  /** Slot origin inside the composed canvas, in pixels. */
  xPx: number;
  yPx: number;
  /** Fixed slot size — inputs are drawn scaled into this box. */
  widthPx: number;
  heightPx: number;
}

export interface PenBatchGrid {
  cols: number;
  rows: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  slots: PenBatchSlot[];
}

/**
 * Pure math: turn a pen count into a grid of slot coordinates. Kept
 * side-effect free so it can be exercised in Node without a DOM.
 */
export function computePenBatchGrid(count: number): PenBatchGrid {
  if (!Number.isInteger(count)) {
    throw new Error(`Pen count must be an integer, got ${count}`);
  }
  if (count < PEN_BATCH_MIN_FILES || count > PEN_BATCH_MAX_FILES) {
    throw new Error(
      `Pen count must be between ${PEN_BATCH_MIN_FILES} and ${PEN_BATCH_MAX_FILES}, got ${count}`,
    );
  }

  const cols = Math.min(PEN_BATCH_COLS, count);
  const rows = Math.ceil(count / PEN_BATCH_COLS);

  const slots: PenBatchSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / PEN_BATCH_COLS);
    const col = i % PEN_BATCH_COLS;
    slots.push({
      index: i,
      row,
      col,
      xPx: col * PEN_STEP_H_PX,
      yPx: row * PEN_STEP_V_PX,
      widthPx: PEN_SLOT_WIDTH_PX,
      heightPx: PEN_SLOT_HEIGHT_PX,
    });
  }

  const canvasWidthPx =
    cols * PEN_SLOT_WIDTH_PX + Math.max(0, cols - 1) * PEN_GAP_H_PX;
  const canvasHeightPx =
    rows * PEN_SLOT_HEIGHT_PX + Math.max(0, rows - 1) * PEN_GAP_V_PX;

  return { cols, rows, canvasWidthPx, canvasHeightPx, slots };
}

export interface PenBatchTileWarning {
  index: number;
  actualWidthPx: number;
  actualHeightPx: number;
}

export interface ComposePenBatchResult {
  blob: Blob;
  mimeType: "image/png";
  widthPx: number;
  heightPx: number;
  /** Always {@link PEN_BATCH_DPI}. */
  dpi: number;
  grid: PenBatchGrid;
  /** Files whose source dimensions differ from 591 x 71 by > tolerance. */
  warnings: PenBatchTileWarning[];
}

/** Allow a couple of pixels of slack for legacy files (e.g. sample is 591x71). */
const SIZE_TOLERANCE_PX = 4;

async function loadImageBitmap(
  file: File,
): Promise<ImageBitmap | HTMLImageElement> {
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
  return { width: bitmap.width, height: bitmap.height };
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("canvas.toBlob returned null"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

/**
 * Compose `files` into a single PNG matching the pen jig geometry.
 * Tiles are drawn scaled into a fixed 591 x 71 slot so the output stays
 * dimensionally correct even if a source is off by a few pixels. Files
 * that deviate from 591 x 71 by more than {@link SIZE_TOLERANCE_PX} are
 * reported through `result.warnings` so the UI can surface a badge.
 */
export async function composePenBatchPng(
  files: readonly File[],
): Promise<ComposePenBatchResult> {
  const grid = computePenBatchGrid(files.length);

  const bitmaps: Array<ImageBitmap | HTMLImageElement> = [];
  try {
    for (const file of files) {
      bitmaps.push(await loadImageBitmap(file));
    }

    const warnings: PenBatchTileWarning[] = [];
    const canvas = document.createElement("canvas");
    canvas.width = grid.canvasWidthPx;
    canvas.height = grid.canvasHeightPx;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2D canvas context is unavailable");

    // Transparent background — pen artwork already carries alpha (see the
    // sample `pix_rosu_set_daniela-*.png`), and the UV printer treats
    // alpha=0 as "do not print".
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, grid.canvasWidthPx, grid.canvasHeightPx);

    for (let i = 0; i < bitmaps.length; i += 1) {
      const bitmap = bitmaps[i]!;
      const slot = grid.slots[i]!;
      const { width, height } = bitmapSize(bitmap);
      if (
        Math.abs(width - PEN_SLOT_WIDTH_PX) > SIZE_TOLERANCE_PX ||
        Math.abs(height - PEN_SLOT_HEIGHT_PX) > SIZE_TOLERANCE_PX
      ) {
        warnings.push({ index: i, actualWidthPx: width, actualHeightPx: height });
      }
      // Always draw into the fixed 591 x 71 slot; drawImage rescales for
      // sub-pixel differences so the physical geometry stays exact.
      ctx.drawImage(
        bitmap,
        slot.xPx,
        slot.yPx,
        PEN_SLOT_WIDTH_PX,
        PEN_SLOT_HEIGHT_PX,
      );
    }

    const rawBlob = await canvasToPngBlob(canvas);
    const rawBytes = new Uint8Array(await rawBlob.arrayBuffer());
    const ppm = dpiToPixelsPerMeter(PEN_BATCH_DPI);
    const withDpi = injectPngPhysChunk(rawBytes, ppm, ppm);
    const blob = new Blob([toArrayBuffer(withDpi)], { type: "image/png" });

    return {
      blob,
      mimeType: "image/png",
      widthPx: grid.canvasWidthPx,
      heightPx: grid.canvasHeightPx,
      dpi: PEN_BATCH_DPI,
      grid,
      warnings,
    };
  } finally {
    for (const bitmap of bitmaps) disposeBitmap(bitmap);
  }
}

/** Build the `pen-batch_<slots>_YYYYMMDD.png` output file name. */
export function buildPenBatchFileName(
  parsed: readonly ParsedNotebookFileName[],
  date: Date = new Date(),
): string {
  return buildBatchFileName(parsed, "pen-batch", date);
}
