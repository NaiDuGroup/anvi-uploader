"use strict";

/**
 * Browser-side composer that lays 1-2 mug designs onto a single A4 sublimation
 * sheet. Pure DOM: `createImageBitmap` + `<canvas>`, same shape as the
 * notebook / pen / freepack composers.
 *
 * Unlike the UV composers there is a real sheet here, so the geometry is
 * fixed rather than derived from the sources:
 *
 *   - sheet: A4 portrait, 21 x 29.7 cm
 *   - cut box: 24 x 9.8 cm — the design plus trim allowance, rotated 90° so
 *     two boxes stand side by side across the short edge of the sheet
 *   - design: 21 x 9.6 cm, centred inside its cut box
 *   - 0.2 cm between the two boxes, the pair centred on the sheet
 *
 * At 300 DPI that resolves to a 2480 x 3508 px sheet with 1157 x 2835 px cut
 * boxes at x = 71 / 1252, y = 336. Each box carries a 1 px black outline on
 * its boundary so the operator sees where to trim.
 *
 * Sources are *not* drawn 1:1 (the notebook composer's rule). Studio files
 * come in at the right 21:9.6 ratio but arbitrary pixel sizes and DPI, so
 * every tile is scaled to fit the 21 x 9.6 cm area and centred; tiles whose
 * aspect ratio drifts from the target are reported through `warnings`.
 */

import { DEFAULT_DPI, cmToPx } from "@/lib/printDimensions";
import { isoDateStampLocal } from "@/lib/notebook/parseNotebookColorFromFileName";
import {
  dpiToPixelsPerMeter,
  injectPngPhysChunk,
} from "@/lib/notebook/pngPhysChunk";

// ─── Public constants ───────────────────────────────────────────────────────

/** The sublimation printer expects 300 DPI; written into the `pHYs` chunk. */
export const MUG_SHEET_DPI = DEFAULT_DPI;

/** A4 portrait. */
export const MUG_SHEET_WIDTH_CM = 21.0;
export const MUG_SHEET_HEIGHT_CM = 29.7;

/** Artwork as it arrives from the studio (matches `MUG_DEFAULT_PRINT`). */
export const MUG_DESIGN_WIDTH_CM = 21.0;
export const MUG_DESIGN_HEIGHT_CM = 9.6;

/**
 * Design plus trim allowance — 1.5 cm on each long side, 0.1 cm on each short
 * side. The outline is drawn on this boundary, not on the design itself.
 */
export const MUG_CUT_BOX_WIDTH_CM = 24.0;
export const MUG_CUT_BOX_HEIGHT_CM = 9.8;

/** Gap between the two cut boxes. */
export const MUG_SHEET_GAP_CM = 0.2;

/** One A4 sheet always holds two slots; an odd tail sheet fills only the last. */
export const MUG_SHEET_SLOTS = 2;
export const MUG_SHEET_MIN_FILES = 1;
export const MUG_SHEET_MAX_FILES = MUG_SHEET_SLOTS;

/** Hairline trim guide. Drawn fully inside the box so it never touches a neighbour. */
export const MUG_CUT_LINE_PX = 1;
export const MUG_CUT_LINE_COLOR = "#000000";
/** Physical paper — the sheet is opaque white, not transparent. */
export const MUG_SHEET_BACKGROUND = "#ffffff";

/** Accepted MIME types for input tiles. */
export const MUG_SHEET_ACCEPT_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
];

/**
 * Relative tolerance on the source aspect ratio before we flag a tile. The
 * target is 21 / 9.6 = 2.1875; 2 % covers rounding in exported files without
 * letting a genuinely wrong crop through unnoticed.
 */
const ASPECT_TOLERANCE = 0.02;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MugSheetSlot {
  /**
   * Zero-based position on the sheet (0 = left, 1 = right). Not the position
   * in `slots`: a one-tile sheet holds a single slot with `index === 1`.
   */
  index: number;
  /** Cut box as placed on the sheet — already rotated, so narrow and tall. */
  cutXPx: number;
  cutYPx: number;
  cutWidthPx: number;
  cutHeightPx: number;
  /** Design area centred inside the cut box, same orientation. */
  designXPx: number;
  designYPx: number;
  designWidthPx: number;
  designHeightPx: number;
}

export interface MugSheetLayout {
  dpi: number;
  sheetWidthPx: number;
  sheetHeightPx: number;
  /** Gap between the two cut boxes, in pixels. */
  gapPx: number;
  /** Margin left of slot 0 / right of slot 1 — identical for both counts. */
  marginXPx: number;
  /** Margin above and below the cut boxes. */
  marginYPx: number;
  slots: MugSheetSlot[];
}

export interface MugSheetTileWarning {
  index: number;
  sourceWidthPx: number;
  sourceHeightPx: number;
  /** Source width / height. Target is `MUG_DESIGN_WIDTH_CM / MUG_DESIGN_HEIGHT_CM`. */
  aspectRatio: number;
}

export interface ComposeMugSheetResult {
  blob: Blob;
  mimeType: "image/png";
  widthPx: number;
  heightPx: number;
  /** Always {@link MUG_SHEET_DPI}. */
  dpi: number;
  layout: MugSheetLayout;
  /** Tiles whose aspect ratio drifted beyond {@link ASPECT_TOLERANCE}. */
  warnings: MugSheetTileWarning[];
}

// ─── Pure geometry ──────────────────────────────────────────────────────────

/** Design size in its natural (unrotated) orientation, in pixels. */
export function mugDesignPx(dpi: number = MUG_SHEET_DPI): {
  width: number;
  height: number;
} {
  return {
    width: cmToPx(MUG_DESIGN_WIDTH_CM, dpi),
    height: cmToPx(MUG_DESIGN_HEIGHT_CM, dpi),
  };
}

/**
 * Slot positions for a `count`-tile sheet. Side-effect free so the UI preview
 * can run it before any file has been decoded.
 *
 * Margins are always computed for a full {@link MUG_SHEET_SLOTS}-slot sheet,
 * so a tail sheet's box lands on exactly the same coordinates as a full one's
 * and the operator trims every sheet the same way. A tail sheet fills the
 * slots from the right, so a lone tile sits against the right edge.
 */
export function computeMugSheetLayout(params: {
  count: number;
  dpi?: number;
}): MugSheetLayout {
  const { count } = params;
  const dpi = params.dpi ?? MUG_SHEET_DPI;

  if (!Number.isInteger(count)) {
    throw new Error(`Mug count must be an integer, got ${count}`);
  }
  if (count < MUG_SHEET_MIN_FILES || count > MUG_SHEET_MAX_FILES) {
    throw new Error(
      `Mug count must be between ${MUG_SHEET_MIN_FILES} and ${MUG_SHEET_MAX_FILES}, got ${count}`,
    );
  }
  if (dpi <= 0) {
    throw new Error(`DPI must be positive, got ${dpi}`);
  }

  const sheetWidthPx = cmToPx(MUG_SHEET_WIDTH_CM, dpi);
  const sheetHeightPx = cmToPx(MUG_SHEET_HEIGHT_CM, dpi);

  // Rotated 90°: the box's long side (24 cm) runs down the sheet.
  const cutWidthPx = cmToPx(MUG_CUT_BOX_HEIGHT_CM, dpi);
  const cutHeightPx = cmToPx(MUG_CUT_BOX_WIDTH_CM, dpi);
  const designWidthPx = cmToPx(MUG_DESIGN_HEIGHT_CM, dpi);
  const designHeightPx = cmToPx(MUG_DESIGN_WIDTH_CM, dpi);
  const gapPx = cmToPx(MUG_SHEET_GAP_CM, dpi);

  const blockWidthPx =
    MUG_SHEET_SLOTS * cutWidthPx + (MUG_SHEET_SLOTS - 1) * gapPx;
  if (blockWidthPx > sheetWidthPx || cutHeightPx > sheetHeightPx) {
    throw new Error(
      `Cut boxes (${blockWidthPx}x${cutHeightPx}px) do not fit the sheet (${sheetWidthPx}x${sheetHeightPx}px)`,
    );
  }

  // Sub-pixel remainders go to the right / bottom margin.
  const marginXPx = Math.floor((sheetWidthPx - blockWidthPx) / 2);
  const marginYPx = Math.floor((sheetHeightPx - cutHeightPx) / 2);
  const insetXPx = Math.floor((cutWidthPx - designWidthPx) / 2);
  const insetYPx = Math.floor((cutHeightPx - designHeightPx) / 2);

  const slots: MugSheetSlot[] = [];
  const firstSlot = MUG_SHEET_SLOTS - count;
  for (let i = 0; i < count; i += 1) {
    const slotIndex = firstSlot + i;
    const cutXPx = marginXPx + slotIndex * (cutWidthPx + gapPx);
    slots.push({
      index: slotIndex,
      cutXPx,
      cutYPx: marginYPx,
      cutWidthPx,
      cutHeightPx,
      designXPx: cutXPx + insetXPx,
      designYPx: marginYPx + insetYPx,
      designWidthPx,
      designHeightPx,
    });
  }

  return {
    dpi,
    sheetWidthPx,
    sheetHeightPx,
    gapPx,
    marginXPx,
    marginYPx,
    slots,
  };
}

// ─── DOM helpers (mirrors composeNotebookBatchPng.ts) ───────────────────────

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

// ─── Compose ───────────────────────────────────────────────────────────────

/**
 * Compose `files` into one A4 sheet PNG. Each tile is rotated 90° clockwise,
 * scaled to fit the 21 x 9.6 cm design area without distortion, centred in
 * its cut box, and framed by the trim outline.
 */
export async function composeMugSheetPng(
  files: readonly File[],
): Promise<ComposeMugSheetResult> {
  const layout = computeMugSheetLayout({ count: files.length });
  const design = mugDesignPx(layout.dpi);
  const targetAspect = design.width / design.height;

  const bitmaps: Array<ImageBitmap | HTMLImageElement> = [];
  try {
    for (const file of files) {
      bitmaps.push(await loadImageBitmap(file));
    }

    const canvas = document.createElement("canvas");
    canvas.width = layout.sheetWidthPx;
    canvas.height = layout.sheetHeightPx;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("2D canvas context is unavailable");
    }

    ctx.fillStyle = MUG_SHEET_BACKGROUND;
    ctx.fillRect(0, 0, layout.sheetWidthPx, layout.sheetHeightPx);
    // Tiles are rescaled here (unlike the UV composers), so smoothing stays on.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const warnings: MugSheetTileWarning[] = [];
    for (let i = 0; i < bitmaps.length; i += 1) {
      const bitmap = bitmaps[i]!;
      const slot = layout.slots[i]!;
      const sourceWidthPx = bitmap.width;
      const sourceHeightPx = bitmap.height;
      if (sourceWidthPx === 0 || sourceHeightPx === 0) {
        throw new Error(`Tile #${i + 1} decoded to zero dimensions`);
      }

      const aspectRatio = sourceWidthPx / sourceHeightPx;
      if (
        Math.abs(aspectRatio - targetAspect) / targetAspect > ASPECT_TOLERANCE
      ) {
        warnings.push({ index: i, sourceWidthPx, sourceHeightPx, aspectRatio });
      }

      drawRotatedContain(ctx, bitmap, slot, design);
      drawCutOutline(ctx, slot);
    }

    const rawBlob = await canvasToPngBlob(canvas);
    const rawBytes = new Uint8Array(await rawBlob.arrayBuffer());
    const ppm = dpiToPixelsPerMeter(layout.dpi);
    const withDpi = injectPngPhysChunk(rawBytes, ppm, ppm);
    const blob = new Blob([toArrayBuffer(withDpi)], { type: "image/png" });

    return {
      blob,
      mimeType: "image/png",
      widthPx: layout.sheetWidthPx,
      heightPx: layout.sheetHeightPx,
      dpi: layout.dpi,
      layout,
      warnings,
    };
  } finally {
    for (const bitmap of bitmaps) disposeBitmap(bitmap);
  }
}

/**
 * Draw `bitmap` rotated 90° clockwise into the slot's design area, scaled to
 * contain (aspect preserved) and centred.
 *
 * The transform puts the local origin at the top-right corner of the design
 * rect and rotates +90°, so the unrotated artwork box `(0, 0, design.width,
 * design.height)` lands exactly on `(designXPx, designYPx, designWidthPx,
 * designHeightPx)` and the artwork's top edge ends up along the right edge of
 * the sheet.
 */
function drawRotatedContain(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap | HTMLImageElement,
  slot: MugSheetSlot,
  design: { width: number; height: number },
): void {
  const scale = Math.min(
    design.width / bitmap.width,
    design.height / bitmap.height,
  );
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  const offsetX = (design.width - drawWidth) / 2;
  const offsetY = (design.height - drawHeight) / 2;

  ctx.save();
  ctx.translate(slot.designXPx + slot.designWidthPx, slot.designYPx);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight);
  ctx.restore();
}

/**
 * Stroke the trim guide on the cut box boundary. The rect is inset by half a
 * pixel so the 1 px line renders crisp and sits entirely inside the box.
 */
function drawCutOutline(
  ctx: CanvasRenderingContext2D,
  slot: MugSheetSlot,
): void {
  const half = MUG_CUT_LINE_PX / 2;
  ctx.save();
  ctx.strokeStyle = MUG_CUT_LINE_COLOR;
  ctx.lineWidth = MUG_CUT_LINE_PX;
  ctx.strokeRect(
    slot.cutXPx + half,
    slot.cutYPx + half,
    slot.cutWidthPx - MUG_CUT_LINE_PX,
    slot.cutHeightPx - MUG_CUT_LINE_PX,
  );
  ctx.restore();
}

// ─── Output file name ───────────────────────────────────────────────────────

/**
 * `mug-sheet_<order1>_<order2>_<YYYYMMDD>.png`. Mug file names carry no colour
 * metadata (unlike notebook covers), so slots are keyed by order number with
 * a positional fallback when the order is unknown.
 */
export function buildMugSheetFileName(
  orderNumbers: readonly (number | null)[],
  date: Date = new Date(),
): string {
  const slots = orderNumbers.map((n, i) =>
    n === null ? `slot${i + 1}` : String(n),
  );
  return `mug-sheet_${slots.join("_")}_${isoDateStampLocal(date)}.png`;
}
