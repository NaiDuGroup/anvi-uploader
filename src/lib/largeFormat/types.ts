/** Persisted JSON on `OrderLine.large_format_line_data`. */
export type LargeFormatCustomerType = "retail" | "dealer";

/** Subset of material fields frozen at order time. */
export interface LargeFormatMaterialSnapshot {
  id: string;
  name: string;
  rollWidthMeters: string;
  /** Nullable catalog override at order time (meters string); omit legacy rows. */
  printableWidthMeters?: string | null;
  rollLengthMeters: string;
  costPerLinearMeter: number;
  /** Unified catalog rate (MDL/lm); optional on legacy frozen rows → fallback to legacy split sum. */
  finalRetailPricePerLinearMeter?: number;
  finalDealerPricePerLinearMeter?: number;
  dealerPricePerLinearMeter: number;
  retailPricePerLinearMeter: number;
  dealerPrintPricePerLinearMeter: number;
  retailPrintPricePerLinearMeter: number;
}

/** Persisted roll packing geometry for previews / audits (stored on order line JSON). */
export interface LargeFormatRollLayoutPersisted {
  algorithmVersion: number;
  printableWidthCm: number;
  nominalRollWidthMeters: number;
  placements: Array<{
    xCm: number;
    yCm: number;
    crossCm: number;
    alongCm: number;
    rotated: boolean;
  }>;
}

export interface LargeFormatLineData {
  materialSnapshot: LargeFormatMaterialSnapshot;
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
  customerType: LargeFormatCustomerType;
  calculatedLinearMeters: number;
  materialCost: number;
  materialSellPrice: number;
  printSellPrice: number;
  totalSellPrice: number;
  estimatedProfit: number;
  layout?: LargeFormatRollLayoutPersisted;
  usefulAreaSqm?: number;
  writtenOffAreaSqm?: number;
  materialEfficiencyPct?: number;
  materialPurchaseCostMdl?: number;
  inkMlUsed?: number;
  inkCostMdl?: number;
  /** Revenue from ink (× markup vs ink COGS) when LF ink multipliers are set. */
  inkSellPriceMdl?: number;
  /** Multiplier from production settings snapshot at order time (ink COGS × this ≈ ink sell). */
  lfInkMarkupMultiplierUsed?: number;
  /** Implied ink sell MDL/m² printed (useful area). */
  inkSellPerSqmMdl?: number;
  totalDirectCostMdl?: number;
  marginPercent?: number;
  avgMaterialCostPerLinearMeterSnapshot?: number;
  avgInkCostPerMlSnapshot?: number;
  inkMlPerSqmSettingUsed?: number;
  inkCostPerSqmMdl?: number;
  /** Production setting: min line sell (MDL) when uplift was applied. */
  lfMinimumLineTotalSettingMdl?: number;
  /** Added to material sell to reach `lfMinimumLineTotalSettingMdl`. */
  lfMinimumLineSellUpliftMdl?: number;
}
