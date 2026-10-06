/**
 * Business card imposition PDF: one page per printed side, each page the full
 * sheet with the card repeated across a centred grid and a grey 1 px cut line
 * around every card.
 *
 * Reuses the roll-layout engine (raster prep via sharp, 300 DPI cap, rotation
 * heuristics) one page at a time, then merges the pages into a single document.
 */

import { PDFDocument } from "pdf-lib";
import { buildRollLayoutPdfBuffer } from "@/lib/largeFormat/rollLayoutPdf";
import type { RollLayoutTileBorder } from "@/lib/largeFormat/rollLayoutPdfCore";
import type { BusinessCardSheetLayout } from "./businessCardSheetLayout";

/** 1 px at 96 dpi ≈ 0.75 pt; grey so it reads as a cut guide, not artwork. */
export const BUSINESS_CARD_CUT_LINE: RollLayoutTileBorder = {
  widthPt: 0.75,
  gray: 0.6,
};

export interface BusinessCardSheetSide {
  /** "front" / "back" — used for error messages only. */
  label: string;
  fileName: string;
  buffer: Buffer;
}

export interface BusinessCardSheetPdfInput {
  layout: BusinessCardSheetLayout;
  /** One entry per printed side, in print order. */
  sides: readonly BusinessCardSheetSide[];
}

async function buildSidePage(
  layout: BusinessCardSheetLayout,
  side: BusinessCardSheetSide,
): Promise<Uint8Array> {
  return buildRollLayoutPdfBuffer({
    printableWidthCm: layout.sheetWidthCm,
    totalAlongCm: layout.sheetHeightCm,
    placements: layout.placements,
    tileBorder: BUSINESS_CARD_CUT_LINE,
    getAsset: async (tileId) => ({
      tileId,
      fileName: side.fileName,
      buffer: side.buffer,
    }),
  });
}

export async function buildBusinessCardSheetPdfBuffer(
  input: BusinessCardSheetPdfInput,
): Promise<Uint8Array> {
  if (input.sides.length === 0) {
    throw new Error("business_card_pdf_no_sides");
  }
  if (input.layout.cardsPerSheet === 0) {
    throw new Error("business_card_pdf_card_does_not_fit");
  }

  const pages = await Promise.all(
    input.sides.map((side) => buildSidePage(input.layout, side)),
  );
  if (pages.length === 1) {
    return pages[0]!;
  }

  const merged = await PDFDocument.create();
  for (const page of pages) {
    const doc = await PDFDocument.load(page);
    const copied = await merged.copyPages(doc, doc.getPageIndices());
    for (const p of copied) {
      merged.addPage(p);
    }
  }
  return merged.save({ useObjectStreams: false });
}
