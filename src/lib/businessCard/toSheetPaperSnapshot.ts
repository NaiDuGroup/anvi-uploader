import type { SheetPaperPricing } from "./sheetPaperStock";
import type { SheetPaperSnapshot } from "./types";

/** Freeze the catalog fields a sheet-product line needs to stay reproducible. */
export function sheetPaperToSnapshot(paper: SheetPaperPricing): SheetPaperSnapshot {
  return {
    id: paper.id,
    name: paper.name,
    gsm: paper.gsm,
    sheetWidthCm: Number(paper.sheetWidthCm),
    sheetHeightCm: Number(paper.sheetHeightCm),
    costPerSheet: paper.catalogCostPerSheet,
    retailPricePerSheet: paper.retailPricePerSheet,
    dealerPricePerSheet: paper.dealerPricePerSheet,
  };
}
