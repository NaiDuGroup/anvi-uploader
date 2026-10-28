import { z } from "zod";
import type { PrintProcess } from "@/lib/printProcess";

export const BUSINESS_EXPENSE_TYPES = [
  "rent",
  "tax",
  "equipment_depreciation",
  "consumables",
  "electricity",
  "other",
] as const;

export type BusinessExpenseType = (typeof BUSINESS_EXPENSE_TYPES)[number];

export const BUSINESS_EXPENSE_PERIODS = [
  "daily",
  "monthly",
  "yearly",
  "one_time",
] as const;

export type BusinessExpensePeriod = (typeof BUSINESS_EXPENSE_PERIODS)[number];

export const productionCostsConfigSchema = z.object({
  mugPrintPerUnit: z.number().int().min(0).default(0),
  packagingPerOrder: z.number().int().min(0).default(0),
  otherConsumablesPerOrder: z.number().int().min(0).default(0),
  /** Roll wide-format tank: ml ink per m² printed (0 = skip ink COGS for LF). */
  inkMlPerSqmLargeFormatRoll: z.number().min(0).default(0),
  /** Warn in admin when order subtotal is below this (MDL, 0 = off). */
  minimumOrderPriceMdl: z.number().int().min(0).default(0),
  /**
   * Each large-format line`s sell total (material + ink revenue) is bumped to at least this (MDL, 0 = off).
   */
  lfMinimumLineTotalMdl: z.number().int().min(0).default(0),
  /**
   * MDL retail sell rate per linear m ≈ effectiveMaterialCostPerLm × this (0 = use manual finals or legacy split).
   */
  lfRetailMarkupMultiplier: z.number().min(0).default(0),
  /**
   * MDL dealer sell rate per linear m ≈ effectiveMaterialCostPerLm × this (0 = use manual finals or legacy split).
   */
  lfDealerMarkupMultiplier: z.number().min(0).default(0),
  /**
   * Retail: ink revenue on LF lines ≈ ink COGS × this (0 = no separate ink revenue; legacy behavior).
   */
  lfInkRetailMarkupMultiplier: z.number().min(0).default(0),
  /** Dealer ink revenue multiplier vs ink COGS; 0 = no separate ink revenue. */
  lfInkDealerMarkupMultiplier: z.number().min(0).default(0),
  /** Each business-card line's sell total is bumped to at least this (MDL, 0 = off). */
  bcMinimumLineTotalMdl: z.number().int().min(0).default(0),
});

export type ProductionCostsConfig = z.infer<typeof productionCostsConfigSchema>;

function nonnegNum(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return v;
}

/**
 * Ink norm (ml per m²) per print process. Only the roll wide-format norm lives
 * here; UV and DTF keep their norms on their print method pages
 * (`PrintMethod.settings`), so they report 0.
 */
export function inkMlPerSqmForPrintProcess(
  prod: ProductionCostsConfig,
  printProcess: PrintProcess,
): number {
  switch (printProcess) {
    case "large_format_roll":
      return prod.inkMlPerSqmLargeFormatRoll;
    case "uv_rigid":
    case "dtf_textile":
      return 0;
  }
}

export function parseProductionCostsJson(raw: unknown): ProductionCostsConfig {
  const base =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const legacyInk = nonnegNum(base.inkMlPerSqm) ?? 0;
  const lfNorm =
    "inkMlPerSqmLargeFormatRoll" in base
      ? (nonnegNum(base.inkMlPerSqmLargeFormatRoll) ?? 0)
      : legacyInk;

  return productionCostsConfigSchema.parse({
    mugPrintPerUnit: base.mugPrintPerUnit ?? 0,
    packagingPerOrder: base.packagingPerOrder ?? 0,
    otherConsumablesPerOrder: base.otherConsumablesPerOrder ?? 0,
    inkMlPerSqmLargeFormatRoll: lfNorm,
    minimumOrderPriceMdl: base.minimumOrderPriceMdl ?? 0,
    lfMinimumLineTotalMdl: Math.max(
      0,
      Math.round(nonnegNum(base.lfMinimumLineTotalMdl) ?? 0),
    ),
    lfRetailMarkupMultiplier: nonnegNum(base.lfRetailMarkupMultiplier) ?? 0,
    lfDealerMarkupMultiplier: nonnegNum(base.lfDealerMarkupMultiplier) ?? 0,
    lfInkRetailMarkupMultiplier: nonnegNum(base.lfInkRetailMarkupMultiplier) ?? 0,
    lfInkDealerMarkupMultiplier: nonnegNum(base.lfInkDealerMarkupMultiplier) ?? 0,
    bcMinimumLineTotalMdl: Math.max(
      0,
      Math.round(nonnegNum(base.bcMinimumLineTotalMdl) ?? 0),
    ),
  });
}

export type OrderProfitDirectCosts = {
  revenue: number;
  productPurchaseCosts: number;
  productionCosts: number;
};

export type OrderProfitAllocated = OrderProfitDirectCosts & {
  allocatedExpenses: number;
  taxes: number;
  netProfit: number;
  profitMarginPct: number;
};
