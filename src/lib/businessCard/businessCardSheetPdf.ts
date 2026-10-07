/**
 * Business card imposition PDF: one page per printed side, each page the full
 * sheet with the card repeated across a centred grid and a grey 1 px cut line
 * around every card. The reverse page is turned 180° for duplex registration.
 *
 * Reuses the roll-layout engine (raster prep via sharp, 300 DPI cap, rotation
 * heuristics) one page at a time, then merges the pages into a single document.
 */

import { degrees, PDFDocument } from "pdf-lib";
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
  /**
   * Turn the finished sheet by this much. The reverse is printed at 180° so it
   * registers with the front after the press flips the sheet; the grid is
   * centred and uniform, so it maps onto itself and the cut lines still line up.
   */
  rotateDeg?: 0 | 180;
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
    input.sides.map(async (side) => ({
      buffer: await buildSidePage(input.layout, side),
      rotateDeg: side.rotateDeg ?? 0,
    })),
  );
  if (pages.length === 1 && pages[0]!.rotateDeg === 0) {
    return pages[0]!.buffer;
  }

  const merged = await PDFDocument.create();
  for (const { buffer, rotateDeg } of pages) {
    const doc = await PDFDocument.load(buffer);
    if (rotateDeg === 0) {
      const copied = await merged.copyPages(doc, doc.getPageIndices());
      for (const p of copied) {
        merged.addPage(p);
      }
      continue;
    }
    // Bake the turn into the content stream instead of setting /Rotate, which
    // some RIPs and print drivers quietly ignore.
    const [source] = doc.getPages();
    const { width, height } = source!.getSize();
    const embedded = await merged.embedPage(source!);
    const page = merged.addPage([width, height]);
    page.drawPage(embedded, {
      x: width,
      y: height,
      rotate: degrees(180),
    });
  }
  return merged.save({ useObjectStreams: false });
}
