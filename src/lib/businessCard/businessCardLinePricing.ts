/**
 * Sheet-product line pricing (business cards, flyers).
 *
 * Retail business cards are billed PER CARD at the storefront rate
 * (`src/lib/storefront/businessCards.ts`, the one place that price lives), so
 * the shop, the staff wizard, the cabinet form and the quotes all charge the
 * same — see {@link businessCardPerCardRateMdl}:
 *
 *   sell   = quantity × shopBcPerCardMdl(sides)
 *
 * Everything else (flyers, dealer business cards) is billed per printed sheet side:
 *
 *   sheets = ceil(quantity / cardsPerSheet)
 *   sell   = sheets × sides × sheetRate(tier)
 *
 * COGS is always sheets × weighted-average paper cost (one sheet, both sides):
 * a double-sided run consumes the same number of sheets but needs two printing
 * passes, so only the sell side carries the ×2.
 */

import { roundMoneyMdl } from "@/lib/largeFormat/largeFormatLinePricing";
import { sidesMultiplier, type BusinessCardSides } from "./businessCardConstants";
import type { BusinessCardCustomerType, SheetPaperSnapshot } from "./types";
import type { SheetProductType } from "@/lib/sheetProduct/sheetProductConfig";
import { shopBcPerCardMdl } from "@/lib/storefront/businessCards";

/**
 * Per-card sell rate (MDL, sides included) of a sheet-product line, or null
 * when it is billed per sheet side. Retail business cards use the storefront
 * price (1.5 lei front, +0.5 back — `shopBcPerCardMdl`) whatever the paper
 * or size; flyers and dealer cards keep the paper's per-sheet rate.
 */
export function businessCardPerCardRateMdl(
  productType: SheetProductType,
  sides: BusinessCardSides,
  customerType: BusinessCardCustomerType,
): number | null {
  if (productType !== "business_card" || customerType !== "retail") return null;
  return shopBcPerCardMdl(sides);
}

export interface BusinessCardPricingInput {
  paperSnapshot: SheetPaperSnapshot;
  /** Weighted-average purchase cost per sheet (MDL); falls back to the catalog hint. */
  avgPaperCostPerSheet: number | null;
  sheetsUsed: number;
  sides: BusinessCardSides;
  customerType: BusinessCardCustomerType;
  /**
   * Bill per card instead of per sheet side ({@link businessCardPerCardRateMdl}):
   * total = quantity × rate; `pricePerSheetMdl` is then informational (total ÷ passes).
   */
  perCard?: { quantity: number; rateMdl: number } | null;
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
  const sheets = Math.max(0, Math.ceil(input.sheetsUsed));
  const passes = sheets * sidesMultiplier(input.sides);
  let pricePerSheetMdl = sheetRateMdl(input.paperSnapshot, input.customerType);
  let totalSellPriceMdl = roundMoneyMdl(passes * pricePerSheetMdl);
  if (input.perCard) {
    // Bani precision, as the shop total (`shopBcTotalMdl`).
    totalSellPriceMdl = round2(Math.max(0, input.perCard.quantity) * Math.max(0, input.perCard.rateMdl));
    pricePerSheetMdl = round2(totalSellPriceMdl / Math.max(1, passes));
  }

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
    estimatedProfitMdl: input.perCard
      ? round2(totalSellPriceMdl - paperCostMdl)
      : roundMoneyMdl(totalSellPriceMdl - paperCostMdl),
  };
}

function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
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
