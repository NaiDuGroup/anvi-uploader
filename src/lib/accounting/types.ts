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
  notebookPrintPerUnit: z.number().int().min(0).default(0),
  packagingPerOrder: z.number().int().min(0).default(0),
  otherConsumablesPerOrder: z.number().int().min(0).default(0),
  /** Roll wide-format tank: ml ink per m² printed (0 = skip ink COGS for LF). */
  inkMlPerSqmLargeFormatRoll: z.number().min(0).default(0),
  /** UV rigid / souvenirs tank: ml per m² when modeled (order flows TBD). */
  inkMlPerSqmUvRigid: z.number().min(0).default(0),
  /** DTF textile tank: ml per m² when modeled (order flows TBD). */
  inkMlPerSqmDtfTextile: z.number().min(0).default(0),
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
});

export type ProductionCostsConfig = z.infer<typeof productionCostsConfigSchema>;

function nonnegNum(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return v;
}

/** Accounting JSON norm per ink tank; used by print-economics UI and future UV/DTF order COGS. */
export function inkMlPerSqmForPrintProcess(
  prod: ProductionCostsConfig,
  printProcess: PrintProcess,
): number {
  switch (printProcess) {
    case "large_format_roll":
      return prod.inkMlPerSqmLargeFormatRoll;
    case "uv_rigid":
      return prod.inkMlPerSqmUvRigid;
    case "dtf_textile":
      return prod.inkMlPerSqmDtfTextile;
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
    notebookPrintPerUnit: base.notebookPrintPerUnit ?? 0,
    packagingPerOrder: base.packagingPerOrder ?? 0,
    otherConsumablesPerOrder: base.otherConsumablesPerOrder ?? 0,
    inkMlPerSqmLargeFormatRoll: lfNorm,
    inkMlPerSqmUvRigid: nonnegNum(base.inkMlPerSqmUvRigid) ?? 0,
    inkMlPerSqmDtfTextile: nonnegNum(base.inkMlPerSqmDtfTextile) ?? 0,
    minimumOrderPriceMdl: base.minimumOrderPriceMdl ?? 0,
    lfMinimumLineTotalMdl: Math.max(
      0,
      Math.round(nonnegNum(base.lfMinimumLineTotalMdl) ?? 0),
    ),
    lfRetailMarkupMultiplier: nonnegNum(base.lfRetailMarkupMultiplier) ?? 0,
    lfDealerMarkupMultiplier: nonnegNum(base.lfDealerMarkupMultiplier) ?? 0,
    lfInkRetailMarkupMultiplier: nonnegNum(base.lfInkRetailMarkupMultiplier) ?? 0,
    lfInkDealerMarkupMultiplier: nonnegNum(base.lfInkDealerMarkupMultiplier) ?? 0,
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
