/**
 * Business card line pricing: billed per printed sheet side.
 *
 *   sheets = ceil(quantity / cardsPerSheet)
 *   sell   = sheets × sides × sheetRate(tier)
 *   COGS   = sheets × weighted-average paper cost   (one sheet, both sides)
 *
 * A double-sided run consumes the same number of sheets but needs two printing
 * passes, so only the sell side carries the ×2.
 */

import { roundMoneyMdl } from "@/lib/largeFormat/largeFormatLinePricing";
import { sidesMultiplier, type BusinessCardSides } from "./businessCardConstants";
import type { BusinessCardCustomerType, SheetPaperSnapshot } from "./types";

export interface BusinessCardPricingInput {
  paperSnapshot: SheetPaperSnapshot;
  /** Weighted-average purchase cost per sheet (MDL); falls back to the catalog hint. */
  avgPaperCostPerSheet: number | null;
  sheetsUsed: number;
  sides: BusinessCardSides;
  customerType: BusinessCardCustomerType;
}

export interface BusinessCardPricingResult {
  pricePerSheetMdl: number;
  totalSellPriceMdl: number;
  paperCostMdl: number;
  avgPaperCostPerSheetSnapshot: number;
  estimatedProfitMdl: number;
}

export function sheetRateMdl(
  paper: SheetPaperSnapshot,
  customerType: BusinessCardCustomerType,
): number {
  return roundMoneyMdl(
    customerType === "dealer" ? paper.dealerPricePerSheet : paper.retailPricePerSheet,
  );
}

/** Effective paper COGS per sheet: weighted average when available, else catalog hint. */
export function effectivePaperCostPerSheet(
  paper: SheetPaperSnapshot,
  avgPaperCostPerSheet: number | null,
): number {
  if (
    typeof avgPaperCostPerSheet === "number" &&
    Number.isFinite(avgPaperCostPerSheet) &&
    avgPaperCostPerSheet > 0
  ) {
    return avgPaperCostPerSheet;
  }
  return Math.max(0, paper.costPerSheet);
}

export function computeBusinessCardLinePricing(
  input: BusinessCardPricingInput,
): BusinessCardPricingResult {
  const pricePerSheetMdl = sheetRateMdl(input.paperSnapshot, input.customerType);
  const sheets = Math.max(0, Math.ceil(input.sheetsUsed));
  const totalSellPriceMdl = roundMoneyMdl(
    sheets * sidesMultiplier(input.sides) * pricePerSheetMdl,
  );

  const costPerSheet = effectivePaperCostPerSheet(
    input.paperSnapshot,
    input.avgPaperCostPerSheet,
  );
  const paperCostMdl = roundMoneyMdl(sheets * costPerSheet);

  return {
    pricePerSheetMdl,
    totalSellPriceMdl,
    paperCostMdl,
    avgPaperCostPerSheetSnapshot: costPerSheet,
    estimatedProfitMdl: roundMoneyMdl(totalSellPriceMdl - paperCostMdl),
  };
}

/**
 * When production `bcMinimumLineTotalMdl` > 0, bumps the line sell so a tiny
 * run (e.g. 12 cards on one sheet) still covers the setup work.
 */
export function applyBusinessCardMinimumLineTotal(
  pricing: BusinessCardPricingResult,
  minTotalMdl: number,
): { pricing: BusinessCardPricingResult; upliftMdl: number } {
  const floor =
    Number.isFinite(minTotalMdl) && minTotalMdl > 0
      ? Math.max(0, Math.round(minTotalMdl))
      : 0;
  if (floor <= 0 || pricing.totalSellPriceMdl >= floor) {
    return { pricing, upliftMdl: 0 };
  }
  const upliftMdl = roundMoneyMdl(floor - pricing.totalSellPriceMdl);
  if (upliftMdl <= 0) {
    return { pricing, upliftMdl: 0 };
  }
  const totalSellPriceMdl = roundMoneyMdl(pricing.totalSellPriceMdl + upliftMdl);
  return {
    pricing: {
      ...pricing,
      totalSellPriceMdl,
      estimatedProfitMdl: roundMoneyMdl(totalSellPriceMdl - pricing.paperCostMdl),
    },
    upliftMdl,
  };
}
