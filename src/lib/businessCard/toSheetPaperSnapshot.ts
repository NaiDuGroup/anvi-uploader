import type { SheetPaper } from "@prisma/client";
import type { SheetPaperSnapshot } from "./types";

/** Freeze the catalog fields a sheet-product line needs to stay reproducible. */
export function sheetPaperToSnapshot(paper: SheetPaper): SheetPaperSnapshot {
  return {
    id: paper.id,
    name: paper.name,
    gsm: paper.gsm,
    sheetWidthCm: Number(paper.sheetWidthCm),
    sheetHeightCm: Number(paper.sheetHeightCm),
    costPerSheet: paper.costPerSheet,
    retailPricePerSheet: paper.retailPricePerSheet,
    dealerPricePerSheet: paper.dealerPricePerSheet,
  };
}
