"use strict";

/**
 * Browser-side composer that merges 2–20 arbitrarily-sized PNG/JPEG tiles
 * onto one UV-flatbed sheet. Pure DOM; runs via `createImageBitmap` + a
 * `<canvas>`.
 *
 * Layout strategy is **shelf-packing** (row-by-row, zero gaps, each row
 * capped at `FREEPACK_MAX_WIDTH_CM`). See `freepackLayout.ts` for the pure
 * math — this file only wires the DOM I/O around it.
 *
 * The output PNG embeds a `pHYs` chunk at the *source* DPI read from the
 * first file (fallback: 300). All tiles are drawn 1:1 — never resized —
 * because mixing DPI between tiles would misrepresent physical dimensions
 * on the UV bed.
 */

import { DEFAULT_DPI, cmToPx } from "@/lib/printDimensions";
import {
  dpiToPixelsPerMeter,
  injectPngPhysChunk,
  readSourceDpiFromFile,
} from "@/lib/notebook/pngPhysChunk";
import {
  FREEPACK_MAX_FILES,
  FREEPACK_MAX_WIDTH_CM,
  FREEPACK_MIN_FILES,
  computeFreepackLayout,
  type FreepackLayout,
} from "./freepackLayout";

// ─── Public re-exports (so the UI tool only imports from one place) ─────────

export {
  FREEPACK_MAX_FILES,
  FREEPACK_MAX_WIDTH_CM,
  FREEPACK_MIN_FILES,
  computeFreepackLayout,
  freepackTilesAllSameSize,
  freepackUniqueSizeCount,
} from "./freepackLayout";
export type {
  FreepackLayout,
  FreepackRow,
  FreepackSlot,
  FreepackTileSize,
} from "./freepackLayout";

/** PNG / JPEG only — same set as the notebook batch tool. */
export const FREEPACK_ACCEPT_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComposeFreepackResult {
  readonly blob: Blob;
  readonly mimeType: "image/png";
  readonly widthPx: number;
  readonly heightPx: number;
  /** DPI written into the output `pHYs` chunk (source DPI from file 0, or 300). */
  readonly dpi: number;
  readonly layout: FreepackLayout;
}

export interface ComposeFreepackOptions {
  /**
   * Optional background colour (any CSS colour) used to fill transparent
   * padding on short tiles. Left unset the canvas stays fully transparent so
   * tile alpha channels pass through verbatim.
   */
  readonly backgroundColor?: string;
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

// ─── Compose ───────────────────────────────────────────────────────────────

/**
 * Compose `files` into a single sheet PNG. Validates upfront (count, blob
 * dims after decode, nothing wider than the 60 cm cap) and throws with a
 * descriptive message so the UI can surface it as an error banner.
 */
export async function composeFreepackPng(
  files: readonly File[],
  options: ComposeFreepackOptions = {},
): Promise<ComposeFreepackResult> {
  if (files.length < FREEPACK_MIN_FILES) {
    throw new Error(
      `Need at least ${FREEPACK_MIN_FILES} files, got ${files.length}`,
    );
  }
  if (files.length > FREEPACK_MAX_FILES) {
    throw new Error(
      `Cannot combine more than ${FREEPACK_MAX_FILES} files, got ${files.length}`,
    );
  }

  const sourceDpi = (await readSourceDpiFromFile(files[0]!)) ?? DEFAULT_DPI;
  const maxWidthPx = cmToPx(FREEPACK_MAX_WIDTH_CM, sourceDpi);

  const bitmaps: Array<ImageBitmap | HTMLImageElement> = [];
  try {
    for (const file of files) {
      bitmaps.push(await loadImageBitmap(file));
    }

    const sizes = bitmaps.map((b) => ({
      widthPx: b.width,
      heightPx: b.height,
    }));
    for (let i = 0; i < sizes.length; i += 1) {
      const s = sizes[i]!;
      if (s.widthPx === 0 || s.heightPx === 0) {
        throw new Error(`Tile #${i} decoded to zero dimensions`);
      }
    }

    // Delegates all packing & validation (overflow, out-of-range widths) to
    // the pure algorithm — see freepackLayout.ts.
    const layout = computeFreepackLayout({ sizes, maxWidthPx });

    const canvas = document.createElement("canvas");
    canvas.width = layout.canvasWidthPx;
    canvas.height = layout.canvasHeightPx;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      throw new Error("2D canvas context is unavailable");
    }

    // Nearest-neighbour: tiles are drawn 1:1 so no scaling happens. Setting
    // this still avoids subtle blurring on some renderers.
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, layout.canvasWidthPx, layout.canvasHeightPx);
    if (options.backgroundColor) {
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, layout.canvasWidthPx, layout.canvasHeightPx);
    }

    for (let i = 0; i < bitmaps.length; i += 1) {
      const bitmap = bitmaps[i]!;
      const slot = layout.slots[i]!;
      ctx.drawImage(
        bitmap,
        slot.offsetXPx,
        slot.offsetYPx,
        slot.widthPx,
        slot.heightPx,
      );
    }

    const rawBlob = await canvasToPngBlob(canvas);
    const rawBytes = new Uint8Array(await rawBlob.arrayBuffer());
    const ppm = dpiToPixelsPerMeter(sourceDpi);
    const withDpi = injectPngPhysChunk(rawBytes, ppm, ppm);
    const blob = new Blob([toArrayBuffer(withDpi)], { type: "image/png" });

    return {
      blob,
      mimeType: "image/png",
      widthPx: layout.canvasWidthPx,
      heightPx: layout.canvasHeightPx,
      dpi: sourceDpi,
      layout,
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

// ─── Output file-name helper ────────────────────────────────────────────────

/**
 * `freepack-YYYYMMDD-HHmm-<N>tiles.png` — fully generic (no color / order
 * parsing like the notebook tool). Timestamp is in the user's local tz which
 * is fine for a workshop-only artifact; the DB history still carries the UTC
 * `createdAt` for ordering.
 */
export function buildFreepackFileName(
  tileCount: number,
  now: Date = new Date(),
): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `freepack-${yyyy}${mm}${dd}-${hh}${mi}-${tileCount}tiles.png`;
}
