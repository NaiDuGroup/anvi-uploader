import type { SheetPaper } from "@prisma/client";
import {
  BUSINESS_CARD_HEIGHT_CM,
  BUSINESS_CARD_WIDTH_CM,
} from "./businessCardConstants";
import { computeBusinessCardSheetLayout } from "./businessCardSheetLayout";

export interface AdminSheetPaperJson {
  id: string;
  name: string;
  sheetWidthCm: number;
  sheetHeightCm: number;
  stockSheets: number;
  avgPurchaseCostPerSheet: number | null;
  /** Weighted average when present, otherwise the catalog hint. */
  effectiveCostPerSheet: number;
  costPerSheet: number;
  retailPricePerSheet: number;
  dealerPricePerSheet: number;
  /** How many standard 9.4 × 5.4 cards this sheet holds — the key operator fact. */
  standardCardsPerSheet: number;
  isActive: boolean;
  sortOrder: number;
}

export function toAdminSheetPaperJson(paper: SheetPaper): AdminSheetPaperJson {
  const sheetWidthCm = Number(paper.sheetWidthCm);
  const sheetHeightCm = Number(paper.sheetHeightCm);
  const avg =
    paper.avgPurchaseCostPerSheet == null
      ? null
      : Number(paper.avgPurchaseCostPerSheet);

  const layout = computeBusinessCardSheetLayout({
    sheetWidthCm,
    sheetHeightCm,
    cardWidthCm: BUSINESS_CARD_WIDTH_CM,
    cardHeightCm: BUSINESS_CARD_HEIGHT_CM,
  });

  return {
    id: paper.id,
    name: paper.name,
    sheetWidthCm,
    sheetHeightCm,
    stockSheets: Number(paper.stockSheets),
    avgPurchaseCostPerSheet: avg,
    effectiveCostPerSheet: avg != null && avg > 0 ? avg : paper.costPerSheet,
    costPerSheet: paper.costPerSheet,
    retailPricePerSheet: paper.retailPricePerSheet,
    dealerPricePerSheet: paper.dealerPricePerSheet,
    standardCardsPerSheet: layout.cardsPerSheet,
    isActive: paper.isActive,
    sortOrder: paper.sortOrder,
  };
}
