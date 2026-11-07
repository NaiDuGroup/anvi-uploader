/**
 * Wizard row state of a «Наклейки на листе» line and its conversions to the
 * order-line input. The run is typed in the row's quantity field either as
 * pieces or as sheets ({@link StickerDraft.quantityMode}); the server always
 * receives pieces.
 */

import type { BusinessCardLineData } from "@/lib/businessCard/types";
import {
  STICKER_MAX_SIDE_MM,
  STICKER_MIN_SIDE_MM,
  stickerFootprintMm,
  type StickerQuantityMode,
  type StickerShape,
  type StickerSheetFormat,
} from "./stickerSheet";

export interface StickerDraft {
  shape: StickerShape;
  /** Width (or diameter for a circle), mm, as typed. */
  widthStr: string;
  heightStr: string;
  cut: boolean;
  format: StickerSheetFormat;
  quantityMode: StickerQuantityMode;
}

export function defaultStickerDraft(): StickerDraft {
  return { shape: "circle", widthStr: "65", heightStr: "65", cut: true, format: "A3+", quantityMode: "pieces" };
}

/** Edit mode: the draft a stored line was made from. */
export function stickerDraftFromLineData(data: BusinessCardLineData): StickerDraft | null {
  const st = data.stickerSheet;
  if (!st) return null;
  return {
    shape: st.shape,
    widthStr: String(st.widthMm),
    heightStr: String(st.heightMm),
    cut: st.cut,
    format: st.format,
    quantityMode: st.quantityMode,
  };
}

/** Typed run of a stored line in its own mode (sheets or pieces). */
export function stickerCopiesStrFromLineData(data: BusinessCardLineData): string {
  return data.stickerSheet?.quantityMode === "sheets" ? String(data.sheetsUsed) : String(data.quantity);
}

function parseMm(raw: string): number | null {
  const v = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(v) && v >= STICKER_MIN_SIDE_MM && v <= STICKER_MAX_SIDE_MM ? v : null;
}

/** Sticker footprint (mm), or null while the size is blank / out of range. */
export function stickerDraftSizeMm(d: StickerDraft): { widthMm: number; heightMm: number } | null {
  const w = parseMm(d.widthStr);
  if (w === null) return null;
  if (d.shape === "circle") return stickerFootprintMm("circle", w, w);
  const h = parseMm(d.heightStr);
  return h === null ? null : { widthMm: w, heightMm: h };
}

/**
 * Why a draft has no size yet: a side is blank / not a number, or outside
 * {@link STICKER_MIN_SIDE_MM}–{@link STICKER_MAX_SIDE_MM}. Null when the size is valid
 * (it may still not fit the sheet — that is the layout's call).
 */
export function stickerDraftSizeIssue(d: StickerDraft): "missing" | "out_of_range" | null {
  const sides = d.shape === "circle" ? [d.widthStr] : [d.widthStr, d.heightStr];
  let issue: "missing" | "out_of_range" | null = null;
  for (const raw of sides) {
    const v = Number.parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return "missing";
    if (v < STICKER_MIN_SIDE_MM || v > STICKER_MAX_SIDE_MM) issue = "out_of_range";
  }
  return issue;
}

/** Pieces the row orders: typed pieces, or typed sheets × stickers per sheet. */
export function stickerDraftPieces(d: StickerDraft, typed: number | null, perSheet: number): number | null {
  if (typed === null || !Number.isInteger(typed) || typed < 1) return null;
  if (d.quantityMode === "sheets") return perSheet > 0 ? typed * perSheet : null;
  return typed;
}
