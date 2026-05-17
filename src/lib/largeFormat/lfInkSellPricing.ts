import type { ProductionCostsConfig } from "@/lib/accounting/types";
import { roundMoneyMdl } from "./largeFormatLinePricing";
import type { LargeFormatCustomerType } from "./types";

export type LfMaterialPricingResult = {
  calculatedLinearMeters: number;
  materialCost: number;
  materialSellPrice: number;
  printSellPrice: number;
  totalSellPrice: number;
  estimatedProfit: number;
};

export function lfInkMarkupMultiplierUsed(
  customerType: LargeFormatCustomerType,
  production: Pick<
    ProductionCostsConfig,
    "lfInkRetailMarkupMultiplier" | "lfInkDealerMarkupMultiplier"
  >,
): number {
  return customerType === "dealer"
    ? production.lfInkDealerMarkupMultiplier
    : production.lfInkRetailMarkupMultiplier;
}

/** Ink revenue = rounded(ink COGS × multiplier) when multiplier & ink COGS positive. */
export function computeLfInkSellPriceMdl(
  inkCostMdl: number,
  customerType: LargeFormatCustomerType,
  production: Pick<
    ProductionCostsConfig,
    "lfInkRetailMarkupMultiplier" | "lfInkDealerMarkupMultiplier"
  >,
): number {
  const mult = lfInkMarkupMultiplierUsed(customerType, production);
  if (!(mult > 0) || !(inkCostMdl > 0)) return 0;
  return roundMoneyMdl(inkCostMdl * mult);
}

/** Adds ink sell to LF line totals; material pricing must be LM-only (`printSellPrice` 0 before merge). */
export function mergeLfPricingWithInkSell(
  materialPricing: LfMaterialPricingResult,
  inkSellPriceMdl: number,
): LfMaterialPricingResult {
  const printSellPrice = inkSellPriceMdl;
  const totalSellPrice = materialPricing.materialSellPrice + printSellPrice;
  const estimatedProfit = totalSellPrice - materialPricing.materialCost;
  return {
    ...materialPricing,
    printSellPrice,
    totalSellPrice,
    estimatedProfit,
  };
}
