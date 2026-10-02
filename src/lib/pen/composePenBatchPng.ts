/**
 * Browser-side composer that lays 2-12 pen artwork PNGs onto the UV flatbed
 * jig grid. The default pen slot is 5 cm × 0.6 cm at 300 DPI (591 × 71 px)
 * with 13.4 cm horizontal / 2.91 cm vertical gaps — matching the standard
 * physical jig. Alternate pen series (e.g. 7.5 × 0.5 cm with 2.9 / 10.6 cm
 * gaps) are supported by passing a custom {@link PenBatchGeometry} to
 * {@link composePenBatchPng} / {@link computePenBatchGrid}.
 *
 * Columns are always 3 (physical jig) and DPI is always 300 (printer
 * expects it in the `pHYs` chunk).
 *
 * The origin offset (5.5 cm, 3 cm) shown in the UV printer software is
 * applied by the operator inside the printer's own layout dialog, so the
 * PNG we produce contains only the pen grid itself. The result is
 * transparent (source alpha preserved).
 */

import {
  buildBatchFileName,
  type ParsedNotebookFileName,
} from "@/lib/notebook/parseNotebookColorFromFileName";
import {
  dpiToPixelsPerMeter,
  injectPngPhysChunk,
} from "@/lib/notebook/pngPhysChunk";

/**
 * Full tile + gap geometry for one pen batch run. All lengths in pixels at
 * `dpi`. See [penBatchPresets.ts](penBatchPresets.ts) for the cm-level
 * presets and the `cm → px` conversion used by the UI.
 */
export interface PenBatchGeometry {
  dpi: number;
  cols: number;
  slotWidthPx: number;
  slotHeightPx: number;
  gapHPx: number;
  gapVPx: number;
}

/** Default geometry — the standard 5 × 0.6 cm pen on the 3-column jig. */
export const PEN_STANDARD_GEOMETRY: PenBatchGeometry = {
  dpi: 300,
  cols: 3,
  slotWidthPx: 591, // 5.00 cm
  slotHeightPx: 71, // 0.60 cm
  gapHPx: 1583, // 13.40 cm
  gapVPx: 344, // 2.91 cm
};

// ─── Back-compat scalar exports ─────────────────────────────────────────────
//
// Older call sites (tests, legacy UI code) read individual scalars from this
// module. Keep them exported as references into the standard geometry so
// nothing breaks when the composer learns to accept alternate geometries.

/** DPI of the pen jig geometry. Also written into the output `pHYs` chunk. */
export const PEN_BATCH_DPI = PEN_STANDARD_GEOMETRY.dpi;
/** Default pen slot width in pixels (5 cm @ 300 DPI). */
export const PEN_SLOT_WIDTH_PX = PEN_STANDARD_GEOMETRY.slotWidthPx;
/** Default pen slot height in pixels (0.6 cm @ 300 DPI). */
export const PEN_SLOT_HEIGHT_PX = PEN_STANDARD_GEOMETRY.slotHeightPx;
/** Default horizontal gap in pixels (13.4 cm @ 300 DPI). */
export const PEN_GAP_H_PX = PEN_STANDARD_GEOMETRY.gapHPx;
/** Default vertical gap in pixels (2.91 cm @ 300 DPI). */
export const PEN_GAP_V_PX = PEN_STANDARD_GEOMETRY.gapVPx;
/** Physical jig accepts 3 pens per row; the tool goes up to 4 rows. */
export const PEN_BATCH_COLS = PEN_STANDARD_GEOMETRY.cols;
export const PEN_BATCH_MIN_FILES = 2;
export const PEN_BATCH_MAX_FILES = 12;

/** Accepted MIME types for input tiles. */
export const PEN_BATCH_ACCEPT_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
];

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
 * Pure math: turn a pen count into a grid of slot coordinates for the given
 * geometry. Side-effect free so it can be exercised in Node without a DOM.
 */
export function computePenBatchGrid(
  count: number,
  geometry: PenBatchGeometry = PEN_STANDARD_GEOMETRY,
): PenBatchGrid {
  if (!Number.isInteger(count)) {
    throw new Error(`Pen count must be an integer, got ${count}`);
  }
  if (count < PEN_BATCH_MIN_FILES || count > PEN_BATCH_MAX_FILES) {
    throw new Error(
      `Pen count must be between ${PEN_BATCH_MIN_FILES} and ${PEN_BATCH_MAX_FILES}, got ${count}`,
    );
  }

  const stepHPx = geometry.slotWidthPx + geometry.gapHPx;
  const stepVPx = geometry.slotHeightPx + geometry.gapVPx;

  const cols = Math.min(geometry.cols, count);
  const rows = Math.ceil(count / geometry.cols);

  const slots: PenBatchSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / geometry.cols);
    const col = i % geometry.cols;
    slots.push({
      index: i,
      row,
      col,
      xPx: col * stepHPx,
      yPx: row * stepVPx,
      widthPx: geometry.slotWidthPx,
      heightPx: geometry.slotHeightPx,
    });
  }

  const canvasWidthPx =
    cols * geometry.slotWidthPx + Math.max(0, cols - 1) * geometry.gapHPx;
  const canvasHeightPx =
    rows * geometry.slotHeightPx + Math.max(0, rows - 1) * geometry.gapVPx;

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

export interface ComposePenBatchOptions {
  /**
   * Geometry to lay the tiles out on. Defaults to {@link PEN_STANDARD_GEOMETRY}
   * (5 × 0.6 cm pen on 3-column jig).
   */
  geometry?: PenBatchGeometry;
}

/**
 * Compose `files` into a single PNG matching the pen jig geometry.
 * Tiles are drawn scaled into the geometry's fixed slot so the output stays
 * dimensionally correct even if a source is off by a few pixels. Files
 * that deviate from the slot by more than {@link SIZE_TOLERANCE_PX} are
 * reported through `result.warnings` so the UI can surface a badge.
 */
export async function composePenBatchPng(
  files: readonly File[],
  options: ComposePenBatchOptions = {},
): Promise<ComposePenBatchResult> {
  const geometry = options.geometry ?? PEN_STANDARD_GEOMETRY;
  const grid = computePenBatchGrid(files.length, geometry);

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
        Math.abs(width - geometry.slotWidthPx) > SIZE_TOLERANCE_PX ||
        Math.abs(height - geometry.slotHeightPx) > SIZE_TOLERANCE_PX
      ) {
        warnings.push({ index: i, actualWidthPx: width, actualHeightPx: height });
      }
      // Always draw into the geometry's slot; drawImage rescales for
      // sub-pixel differences so the physical geometry stays exact.
      ctx.drawImage(
        bitmap,
        slot.xPx,
        slot.yPx,
        geometry.slotWidthPx,
        geometry.slotHeightPx,
      );
    }

    const rawBlob = await canvasToPngBlob(canvas);
    const rawBytes = new Uint8Array(await rawBlob.arrayBuffer());
    const ppm = dpiToPixelsPerMeter(geometry.dpi);
    const withDpi = injectPngPhysChunk(rawBytes, ppm, ppm);
    const blob = new Blob([toArrayBuffer(withDpi)], { type: "image/png" });

    return {
      blob,
      mimeType: "image/png",
      widthPx: grid.canvasWidthPx,
      heightPx: grid.canvasHeightPx,
      dpi: geometry.dpi,
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
