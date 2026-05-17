import { roundMoneyMdl } from "@/lib/largeFormat/largeFormatLinePricing";
import type { LfMaterialPricingResult } from "@/lib/largeFormat/lfInkSellPricing";

/**
 * When production `lfMinimumLineTotalMdl` > 0, bumps line sell so clients pay at least
 * that much per LF line (uplift attributed to material sell, ink sell unchanged).
 */
export function applyLfMinimumLineSellTotalMdl(
  pricing: LfMaterialPricingResult,
  minTotalMdl: number,
): { pricing: LfMaterialPricingResult; upliftMdl: number } {
  const floor =
    typeof minTotalMdl === "number" &&
    Number.isFinite(minTotalMdl) &&
    minTotalMdl > 0
      ? Math.max(0, Math.round(minTotalMdl))
      : 0;
  if (floor <= 0 || pricing.totalSellPrice >= floor) {
    return { pricing, upliftMdl: 0 };
  }
  const uplift = roundMoneyMdl(floor - pricing.totalSellPrice);
  if (uplift <= 0) {
    return { pricing, upliftMdl: 0 };
  }
  const materialSellPrice = roundMoneyMdl(pricing.materialSellPrice + uplift);
  const totalSellPrice = roundMoneyMdl(materialSellPrice + pricing.printSellPrice);
  const estimatedProfit = roundMoneyMdl(totalSellPrice - pricing.materialCost);
  return {
    pricing: {
      ...pricing,
      materialSellPrice,
      totalSellPrice,
      estimatedProfit,
    },
    upliftMdl: uplift,
  };
}
