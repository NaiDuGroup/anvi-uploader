import type { SheetPaperPricing } from "./sheetPaperStock";
import {
  BUSINESS_CARD_HEIGHT_CM,
  BUSINESS_CARD_WIDTH_CM,
} from "./businessCardConstants";
import { computeBusinessCardSheetLayout } from "./businessCardSheetLayout";

export interface AdminSheetPaperJson {
  id: string;
  name: string;
  /** Paper weight (g/m²); null when not recorded. */
  gsm: number | null;
  sheetWidthCm: number;
  sheetHeightCm: number;
  /** Unified stock variant holding balance and cost (null only for rows not linked yet). */
  stockVariantId: string | null;
  stockSku: string | null;
  /** Balance of the variant (sheets). */
  stockSheets: number;
  avgPurchaseCostPerSheet: number | null;
  /** Weighted average when present, otherwise the catalog hint. */
  effectiveCostPerSheet: number;
  /** Manual cost hint of the variant (MDL / sheet), used until the first receipt. */
  costPerSheet: number;
  retailPricePerSheet: number;
  dealerPricePerSheet: number;
  /** How many standard 9.4 × 5.4 cards this sheet holds — the key operator fact. */
  standardCardsPerSheet: number;
  isActive: boolean;
  sortOrder: number;
}

export function toAdminSheetPaperJson(paper: SheetPaperPricing): AdminSheetPaperJson {
  const sheetWidthCm = Number(paper.sheetWidthCm);
  const sheetHeightCm = Number(paper.sheetHeightCm);
  const avg: number | null = paper.avgCostPerSheet;

  const layout = computeBusinessCardSheetLayout({
    sheetWidthCm,
    sheetHeightCm,
    cardWidthCm: BUSINESS_CARD_WIDTH_CM,
    cardHeightCm: BUSINESS_CARD_HEIGHT_CM,
  });

  return {
    id: paper.id,
    name: paper.name,
    gsm: paper.gsm,
    sheetWidthCm,
    sheetHeightCm,
    stockVariantId: paper.stockVariantId,
    stockSku: paper.stockSku,
    stockSheets: paper.sheetsInStock,
    avgPurchaseCostPerSheet: avg,
    effectiveCostPerSheet: avg != null && avg > 0 ? avg : paper.catalogCostPerSheet,
    costPerSheet: paper.catalogCostPerSheet,
    retailPricePerSheet: paper.retailPricePerSheet,
    dealerPricePerSheet: paper.dealerPricePerSheet,
    standardCardsPerSheet: layout.cardsPerSheet,
    isActive: paper.isActive,
    sortOrder: paper.sortOrder,
  };
}
