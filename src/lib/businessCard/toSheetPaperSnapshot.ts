import type { SheetPaper } from "@prisma/client";
import type { SheetPaperSnapshot } from "./types";

/** Freeze the catalog fields a business-card line needs to stay reproducible. */
export function sheetPaperToSnapshot(paper: SheetPaper): SheetPaperSnapshot {
  return {
    id: paper.id,
    name: paper.name,
    sheetWidthCm: Number(paper.sheetWidthCm),
    sheetHeightCm: Number(paper.sheetHeightCm),
    costPerSheet: paper.costPerSheet,
    retailPricePerSheet: paper.retailPricePerSheet,
    dealerPricePerSheet: paper.dealerPricePerSheet,
  };
}
