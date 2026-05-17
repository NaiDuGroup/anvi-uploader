import type { ProductionCostsConfig } from "@/lib/accounting/types";
import type { LargeFormatMaterial } from "@prisma/client";
import {
  effectiveLfSellRatePerLinearMeterMdl,
  roundMoneyMdl,
  type LargeFormatPricingMaterialInput,
} from "./largeFormatLinePricing";

type MaterialForLfRates = Pick<
  LargeFormatMaterial,
  | "costPerLinearMeter"
  | "finalRetailPricePerLinearMeter"
  | "finalDealerPricePerLinearMeter"
  | "dealerPricePerLinearMeter"
  | "retailPricePerLinearMeter"
  | "dealerPrintPricePerLinearMeter"
  | "retailPrintPricePerLinearMeter"
  | "manualFinalRetailPricePerLinearMeter"
  | "manualFinalDealerPricePerLinearMeter"
>;

export function toLfPricingMaterialInput(m: MaterialForLfRates): LargeFormatPricingMaterialInput {
  return {
    costPerLinearMeter: m.costPerLinearMeter,
    finalRetailPricePerLinearMeter: m.finalRetailPricePerLinearMeter,
    finalDealerPricePerLinearMeter: m.finalDealerPricePerLinearMeter,
    dealerPricePerLinearMeter: m.dealerPricePerLinearMeter,
    retailPricePerLinearMeter: m.retailPricePerLinearMeter,
    dealerPrintPricePerLinearMeter: m.dealerPrintPricePerLinearMeter,
    retailPrintPricePerLinearMeter: m.retailPrintPricePerLinearMeter,
  };
}

/**
 * Resolves per–linear-meter sell rates: optional per-material manual override, else
 * effectiveCost × global markup (when multiplier &gt; 0), else legacy unified/ split finals.
 */
export function resolveLfSellRatesPerLinearMeterMdl(params: {
  effectiveMaterialCostPerLinearMeterMdl: number;
  production: ProductionCostsConfig;
  material: MaterialForLfRates;
}): { finalRetailPricePerLinearMeter: number; finalDealerPricePerLinearMeter: number } {
  const eff = params.effectiveMaterialCostPerLinearMeterMdl;
  const prod = params.production;
  const m = params.material;
  const multR = prod.lfRetailMarkupMultiplier;
  const multD = prod.lfDealerMarkupMultiplier;
  const base = toLfPricingMaterialInput(m);

  let finalRetailPricePerLinearMeter: number;
  if (m.manualFinalRetailPricePerLinearMeter != null) {
    finalRetailPricePerLinearMeter = m.manualFinalRetailPricePerLinearMeter;
  } else if (multR > 0) {
    finalRetailPricePerLinearMeter = roundMoneyMdl(eff * multR);
  } else {
    finalRetailPricePerLinearMeter = effectiveLfSellRatePerLinearMeterMdl("retail", base);
  }

  let finalDealerPricePerLinearMeter: number;
  if (m.manualFinalDealerPricePerLinearMeter != null) {
    finalDealerPricePerLinearMeter = m.manualFinalDealerPricePerLinearMeter;
  } else if (multD > 0) {
    finalDealerPricePerLinearMeter = roundMoneyMdl(eff * multD);
  } else {
    finalDealerPricePerLinearMeter = effectiveLfSellRatePerLinearMeterMdl("dealer", base);
  }

  return { finalRetailPricePerLinearMeter, finalDealerPricePerLinearMeter };
}
