import type { LargeFormatMaterial } from "@prisma/client";
import type { ProductionCostsConfig } from "@/lib/accounting/types";
import { effectiveLfMaterialCostPerLinearMeterMdl } from "@/lib/largeFormat/lfRollOrderEconomics";
import { resolveLfSellRatesPerLinearMeterMdl } from "@/lib/largeFormat/lfResolveSellRates";

/** JSON shape for admin catalog + order forms. */
export function toAdminLargeFormatMaterialJson(
  m: LargeFormatMaterial,
  production: ProductionCostsConfig,
) {
  const rollW = Number(m.rollWidthMeters);
  const impliedLm =
    m.avgPurchaseCostPerLinearMeter != null
      ? Number(m.avgPurchaseCostPerLinearMeter)
      : m.costPerLinearMeter;
  const purchaseCostPerSqmMdl =
    rollW > 0 && Number.isFinite(impliedLm)
      ? Math.round((impliedLm / rollW) * 100) / 100
      : null;

  const effLm = effectiveLfMaterialCostPerLinearMeterMdl(m);
  const resolved = resolveLfSellRatesPerLinearMeterMdl({
    effectiveMaterialCostPerLinearMeterMdl: effLm,
    production,
    material: m,
  });

  return {
    id: m.id,
    name: m.name,
    rollWidthMeters: m.rollWidthMeters.toString(),
    printableWidthMeters: m.printableWidthMeters?.toString() ?? null,
    rollLengthMeters: m.rollLengthMeters.toString(),
    stockLinearMeters: Number(m.stockLinearMeters),
    avgPurchaseCostPerLinearMeter:
      m.avgPurchaseCostPerLinearMeter != null
        ? Number(m.avgPurchaseCostPerLinearMeter)
        : null,
    purchaseCostPerSqmMdl,
    costPerLinearMeter: m.costPerLinearMeter,
    /** Stored DB unified columns (may be 0 when using markup formula). */
    finalRetailPricePerLinearMeter: m.finalRetailPricePerLinearMeter,
    finalDealerPricePerLinearMeter: m.finalDealerPricePerLinearMeter,
    /** Effective sell rates for this material (manual override, markup × cost, or legacy). */
    effectiveRetailPricePerLinearMeter: resolved.finalRetailPricePerLinearMeter,
    effectiveDealerPricePerLinearMeter: resolved.finalDealerPricePerLinearMeter,
    manualFinalRetailPricePerLinearMeter: m.manualFinalRetailPricePerLinearMeter,
    manualFinalDealerPricePerLinearMeter: m.manualFinalDealerPricePerLinearMeter,
    dealerPricePerLinearMeter: m.dealerPricePerLinearMeter,
    retailPricePerLinearMeter: m.retailPricePerLinearMeter,
    dealerPrintPricePerLinearMeter: m.dealerPrintPricePerLinearMeter,
    retailPrintPricePerLinearMeter: m.retailPrintPricePerLinearMeter,
    isActive: m.isActive,
    sortOrder: m.sortOrder,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export type AdminLargeFormatMaterialJson = ReturnType<
  typeof toAdminLargeFormatMaterialJson
>;
