import type { LfPricingMaterial } from "./lfMaterialStock";
import type { LargeFormatMaterialSnapshot } from "./types";

export function largeFormatMaterialToSnapshot(
  m: LfPricingMaterial,
  resolvedSellRates?: {
    finalRetailPricePerLinearMeter: number;
    finalDealerPricePerLinearMeter: number;
  },
): LargeFormatMaterialSnapshot {
  return {
    id: m.id,
    name: m.name,
    rollWidthMeters: m.rollWidthMeters.toString(),
    printableWidthMeters: m.printableWidthMeters?.toString() ?? null,
    costPerLinearMeter: m.catalogCostPerLm,
    finalRetailPricePerLinearMeter:
      resolvedSellRates?.finalRetailPricePerLinearMeter ??
      m.finalRetailPricePerLinearMeter,
    finalDealerPricePerLinearMeter:
      resolvedSellRates?.finalDealerPricePerLinearMeter ??
      m.finalDealerPricePerLinearMeter,
    dealerPricePerLinearMeter: m.dealerPricePerLinearMeter,
    retailPricePerLinearMeter: m.retailPricePerLinearMeter,
    dealerPrintPricePerLinearMeter: m.dealerPrintPricePerLinearMeter,
    retailPrintPricePerLinearMeter: m.retailPrintPricePerLinearMeter,
  };
}
