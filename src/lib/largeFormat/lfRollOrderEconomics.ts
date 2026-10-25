import { roundMoneyMdl } from "@/lib/largeFormat/largeFormatLinePricing";

/**
 * MDL per linear meter for material COGS: the roll variant's weighted average,
 * else its manual cost hint (same fallback as the legacy catalog columns).
 */
export function effectiveLfMaterialCostPerLinearMeterMdl(material: {
  catalogCostPerLm: number;
  avgCostPerLm: number | null | undefined;
}): number {
  const avg = material.avgCostPerLm;
  if (avg == null) {
    return material.catalogCostPerLm;
  }
  if (!Number.isFinite(avg) || avg < 0) {
    return material.catalogCostPerLm;
  }
  return avg;
}

export interface LfRollOrderEconomicsResult {
  usefulAreaSqm: number;
  writtenOffAreaSqm: number;
  materialEfficiencyPct: number;
  materialPurchaseCostMdl: number;
  inkMlUsed: number;
  inkCostMdl: number;
  totalDirectCostMdl: number;
  marginPercent: number;
  inkCostPerSqmMdl: number;
}

export function computeLfRollOrderEconomics(input: {
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
  calculatedLinearMeters: number;
  rollWidthMeters: number;
  effectiveMaterialCostPerLinearMeterMdl: number;
  inkMlPerSqm: number;
  avgInkCostPerMlMdl: number;
  totalSellPriceMdl: number;
}): LfRollOrderEconomicsResult {
  const wM = input.printWidthCm / 100;
  const hM = input.printHeightCm / 100;
  const usefulAreaSqm = wM * hM * input.quantity;
  const writtenOffAreaSqm = input.calculatedLinearMeters * input.rollWidthMeters;

  let materialEfficiencyPct = 0;
  if (writtenOffAreaSqm > 1e-9) {
    materialEfficiencyPct = Math.round((usefulAreaSqm / writtenOffAreaSqm) * 10000) / 100;
  }

  const materialPurchaseCostMdl = roundMoneyMdl(
    input.calculatedLinearMeters * input.effectiveMaterialCostPerLinearMeterMdl,
  );
  const inkMlUsed = usefulAreaSqm * input.inkMlPerSqm;
  const rawInkCostMdl = inkMlUsed * input.avgInkCostPerMlMdl;
  /** Integer MDL: plain round collapses microlitre jobs (<0.5 MDL) to 0; reserve 1 MDL when usage is positive. */
  let inkCostMdl = roundMoneyMdl(rawInkCostMdl);
  if (
    inkCostMdl === 0 &&
    rawInkCostMdl > 1e-9 &&
    input.avgInkCostPerMlMdl > 1e-9 &&
    inkMlUsed > 1e-9
  ) {
    inkCostMdl = 1;
  }
  const inkCostPerSqmMdl =
    usefulAreaSqm > 1e-9 ? roundMoneyMdl(inkCostMdl / usefulAreaSqm) : 0;
  const totalDirectCostMdl = materialPurchaseCostMdl + inkCostMdl;
  const marginPercent =
    input.totalSellPriceMdl > 0
      ? Math.round(
          ((input.totalSellPriceMdl - totalDirectCostMdl) / input.totalSellPriceMdl) * 10000,
        ) / 100
      : 0;

  return {
    usefulAreaSqm: Math.round(usefulAreaSqm * 1_000_000) / 1_000_000,
    writtenOffAreaSqm: Math.round(writtenOffAreaSqm * 1_000_000) / 1_000_000,
    materialEfficiencyPct,
    materialPurchaseCostMdl,
    inkMlUsed: Math.round(inkMlUsed * 1000) / 1000,
    inkCostMdl,
    totalDirectCostMdl,
    marginPercent,
    inkCostPerSqmMdl,
  };
}

/** Recompute margin only when LF line revenue is known after ink sell markup. */
export function lfRollEconomicsWithRevenueMargin(
  base: LfRollOrderEconomicsResult,
  totalSellPriceMdl: number,
): LfRollOrderEconomicsResult {
  const marginPercent =
    totalSellPriceMdl > 0
      ? Math.round(
          ((totalSellPriceMdl - base.totalDirectCostMdl) / totalSellPriceMdl) * 10000,
        ) / 100
      : 0;
  return { ...base, marginPercent };
}
