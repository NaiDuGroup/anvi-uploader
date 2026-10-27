"use strict";

/**
 * Pack already-composed mug sheet PNGs into one multi-page A4 PDF, so the
 * operator sends a single file to the sublimation printer instead of one
 * PNG per sheet.
 *
 * Each PNG fills its page edge to edge. The page is exactly A4, so a
 * 2480 x 3508 px sheet lands at 300 DPI and prints at 100 % scale with the
 * same geometry as the PNG did.
 */

import { PDFDocument } from "pdf-lib";
import { isoDateStampLocal } from "@/lib/notebook/parseNotebookColorFromFileName";
import { orderNumbersFileNamePart } from "@/lib/workshopBoard/orderNumbersFileNamePart";
import { MUG_SHEET_HEIGHT_CM, MUG_SHEET_WIDTH_CM } from "./composeMugSheetPng";

const POINTS_PER_CM = 72 / 2.54;

export const MUG_SHEET_PDF_WIDTH_PT = MUG_SHEET_WIDTH_CM * POINTS_PER_CM;
export const MUG_SHEET_PDF_HEIGHT_PT = MUG_SHEET_HEIGHT_CM * POINTS_PER_CM;

export async function buildMugSheetsPdf(
  pngPages: readonly Uint8Array[],
): Promise<Uint8Array> {
  if (pngPages.length === 0) {
    throw new Error("buildMugSheetsPdf: no pages");
  }
  const pdf = await PDFDocument.create();
  pdf.setTitle("Mug sheets");
  for (const png of pngPages) {
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([MUG_SHEET_PDF_WIDTH_PT, MUG_SHEET_PDF_HEIGHT_PT]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: MUG_SHEET_PDF_WIDTH_PT,
      height: MUG_SHEET_PDF_HEIGHT_PT,
    });
  }
  return pdf.save();
}

/**
 * `mug-sheets_<order1>_<order2>_…_<N>p_<YYYYMMDD>.pdf` — every order inside
 * the PDF is listed (see `orderNumbersFileNamePart`).
 */
export function buildMugSheetsPdfFileName(
  orderNumbers: readonly (number | null)[],
  pageCount: number,
  date: Date = new Date(),
): string {
  const parts = ["mug-sheets"];
  const orders = orderNumbersFileNamePart(orderNumbers);
  if (orders) parts.push(orders);
  parts.push(`${pageCount}p`, isoDateStampLocal(date));
  return `${parts.join("_")}.pdf`;
}
