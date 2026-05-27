/**
 * Size-preset pricing override for large-format roll lines.
 *
 * When the wizard picks a preset from the material's price list, the final
 * line price is the preset's unit price × quantity. This bypasses:
 *   - Material × linear meters sell-rate math
 *   - Ink markup merge (`mergeLfPricingWithInkSell`)
 *   - Minimum line uplift (`applyLfMinimumLineSellTotalMdl`)
 *
 * COGS (material + ink) still flows through normally so accounting / profit
 * is accurate; only the sell side is locked to the preset.
 */
import { roundMoneyMdl } from "./largeFormatLinePricing";
import type { LargeFormatCustomerType } from "./types";

export interface LfSizePresetPricingInput {
  /** Authoritative auto-computed pricing (material + ink merged), used as the base shape. */
  pricing: {
    calculatedLinearMeters: number;
    materialCost: number;
    materialSellPrice: number;
    printSellPrice: number;
    totalSellPrice: number;
    estimatedProfit: number;
  };
  /** Unit price (MDL integer) from the preset, for the relevant customer type. */
  presetPriceMdl: number;
  /** Copies / pieces of the preset on this line. */
  quantity: number;
  /** Optional ink COGS to subtract from profit (already included in `materialCost` aggregation upstream? — usually no). */
  inkCostMdl?: number;
}

/**
 * Replaces `materialSellPrice` / `printSellPrice` / `totalSellPrice` with
 * preset-driven values; recomputes `estimatedProfit = totalSellPrice − COGS`.
 *
 * Keeps `calculatedLinearMeters` and `materialCost` untouched.
 */
export function applyLfSizePresetOverride(
  input: LfSizePresetPricingInput,
): typeof input.pricing {
  const unitPrice = Math.max(0, Math.round(input.presetPriceMdl));
  const qty = Math.max(0, Math.round(input.quantity));
  const totalSellPrice = roundMoneyMdl(unitPrice * qty);

  /** All revenue collapses into materialSellPrice — printSellPrice stays 0 so ink markup is not double-counted. */
  const materialSellPrice = totalSellPrice;
  const printSellPrice = 0;
  const inkCogs = Math.max(0, Math.round(input.inkCostMdl ?? 0));
  const estimatedProfit = totalSellPrice - input.pricing.materialCost - inkCogs;

  return {
    calculatedLinearMeters: input.pricing.calculatedLinearMeters,
    materialCost: input.pricing.materialCost,
    materialSellPrice,
    printSellPrice,
    totalSellPrice,
    estimatedProfit,
  };
}

/** Helper: pick the correct preset price field by customer type. */
export function selectLfSizePresetPriceMdl(
  preset: { retailPriceMdl: number; dealerPriceMdl: number },
  customerType: LargeFormatCustomerType,
): number {
  return customerType === "dealer" ? preset.dealerPriceMdl : preset.retailPriceMdl;
}
