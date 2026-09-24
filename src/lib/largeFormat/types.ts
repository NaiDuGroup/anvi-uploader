/** Persisted JSON on `OrderLine.large_format_line_data`. */
export type LargeFormatCustomerType = "retail" | "dealer";

/** Subset of material fields frozen at order time. */
export interface LargeFormatMaterialSnapshot {
  id: string;
  name: string;
  rollWidthMeters: string;
  /** Nullable catalog override at order time (meters string); omit legacy rows. */
  printableWidthMeters?: string | null;
  /** @deprecated removed from UI; kept as optional for legacy frozen snapshots */
  rollLengthMeters?: string | null;
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

/**
 * Frozen copy of the size preset used on this line, so the line stays
 * reproducible even if the catalog preset is later edited or deleted.
 */
export interface LfSizePresetSnapshot {
  presetId: string;
  widthCm: number;
  heightCm: number;
  /** Per-piece price (MDL integer) at order time, for the chosen customer type. */
  unitPriceMdl: number;
  customerType: LargeFormatCustomerType;
}

export interface LargeFormatLineData {
  materialSnapshot: LargeFormatMaterialSnapshot;
  /** When set, line price = `sizePresetSnapshot.unitPriceMdl × quantity`; ink/min uplift bypassed. */
  sizePresetSnapshot?: LfSizePresetSnapshot;
  /**
   * Pricing policy for this line. When "min_sufficient_width", the line was
   * ordered via material family (e.g. "ORACAL MATT") and billed on the
   * minimally sufficient roll; workshop may later confirm production on a
   * different roll without changing the sell price. Omitted for legacy lines.
   */
  pricingPolicy?: "min_sufficient_width";
  /**
   * Material family key (e.g. "ORACAL MATT") when `pricingPolicy` is set.
   * Used to identify which rolls belong to the same interchangeable family.
   */
  materialFamilyKey?: string;
  /**
   * Billing roll: the minimally sufficient roll whose price was locked at
   * order time. Immutable after order create. When `pricingPolicy` is set,
   * this duplicates `materialSnapshot` for explicitness; workshop production
   * roll changes do not affect billing.
   */
  billingRoll?: {
    materialId: string;
    materialSnapshot: LargeFormatMaterialSnapshot;
  };
  /**
   * Production roll: the actual roll used by workshop after confirm-roll.
   * Set only when workshop explicitly confirms print on a roll different from
   * the billing roll. Affects COGS/stock but never the sell price.
   */
  productionRoll?: {
    materialId: string;
    materialSnapshot: LargeFormatMaterialSnapshot;
    confirmedAt?: string;
    confirmedBy?: string;
  };
  printWidthCm: number;
  printHeightCm: number;
  /**
   * Mirrored gallery-wrap margin (cm) added to every side for canvas pieces
   * (e.g. "Panza din bumbac"). `printWidthCm`/`printHeightCm` keep storing the
   * visible face size; the printed/material size is face + 2 × this per axis.
   * Omitted (or 0) for materials without a wrap.
   */
  galleryWrapCm?: number;
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
