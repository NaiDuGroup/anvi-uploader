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

/**
 * Apply the minimum total to the **sum** of a group of family lines.
 *
 * Instead of enforcing `lfMinimumLineTotalMdl` per line, this checks whether
 * the aggregate `totalSellPrice` of all lines in the group meets the floor.
 * If not, the uplift is distributed proportionally across lines (attributed
 * to `materialSellPrice`), with the last line absorbing any rounding remainder.
 */
export function applyGroupMinimumSellTotal(
  pricings: readonly LfMaterialPricingResult[],
  minTotalMdl: number,
): { pricings: LfMaterialPricingResult[]; totalUpliftMdl: number } {
  const floor =
    typeof minTotalMdl === "number" &&
    Number.isFinite(minTotalMdl) &&
    minTotalMdl > 0
      ? Math.max(0, Math.round(minTotalMdl))
      : 0;
  if (floor <= 0 || pricings.length === 0) {
    return { pricings: [...pricings], totalUpliftMdl: 0 };
  }

  const sum = pricings.reduce((s, p) => s + p.totalSellPrice, 0);
  if (sum >= floor) {
    return { pricings: [...pricings], totalUpliftMdl: 0 };
  }

  const totalUplift = roundMoneyMdl(floor - sum);
  if (totalUplift <= 0) {
    return { pricings: [...pricings], totalUpliftMdl: 0 };
  }

  // Distribute proportionally by sell price; equal shares when sum is zero.
  const weights =
    sum > 0
      ? pricings.map((p) => p.totalSellPrice / sum)
      : pricings.map(() => 1 / pricings.length);

  let distributed = 0;
  const result: LfMaterialPricingResult[] = pricings.map((p, i) => {
    const isLast = i === pricings.length - 1;
    const share = isLast
      ? roundMoneyMdl(totalUplift - distributed)
      : roundMoneyMdl(totalUplift * weights[i]!);
    distributed += share;
    const materialSellPrice = roundMoneyMdl(p.materialSellPrice + share);
    const totalSellPrice = roundMoneyMdl(materialSellPrice + p.printSellPrice);
    const estimatedProfit = roundMoneyMdl(totalSellPrice - p.materialCost);
    return { ...p, materialSellPrice, totalSellPrice, estimatedProfit };
  });

  return { pricings: result, totalUpliftMdl: totalUplift };
}
