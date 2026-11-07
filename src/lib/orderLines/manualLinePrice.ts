/**
 * Staff «ручная цена» on order lines other than sheet products (those live in
 * `businessCard/manualSheetLinePrice.ts`).
 *
 * Two kinds, as the order wizard's price field means them:
 *  - **line total** — large format, DTF, UV (incl. UV-DTF stickers),
 *    sublimation: stored inside the line's JSON snapshot. The snapshot's sell
 *    total (`totalSellPrice` / `pricing.totalSellPriceMdl`) and estimated
 *    profit carry the manual figure, `manualTotalSellPriceMdl` marks it and
 *    `computedTotalSellPriceMdl` keeps the calculated total for reference.
 *    Costs are never touched.
 *  - **price per piece** — paper print, mug, notebook, pen: the wizard bills
 *    unit × copies, so the unit price is stored (`OrderLine.manualUnitPriceMdl`).
 *
 * A number sets the manual price, null clears it (back to the calculated
 * price), undefined keeps what the line had (requests that do not send it).
 * Dealers never send it (their schemas omit the fields; the server prices).
 */

import type { LargeFormatLineData } from "@/lib/largeFormat/types";
import type { DtfLineData } from "@/lib/dtf/types";
import type { UvLineData } from "@/lib/uv/types";
import type { SublimationLineData } from "@/lib/sublimation/types";
import { normalizeManualLineTotalMdl } from "@/lib/businessCard/manualSheetLinePrice";

const round2 = (n: number): number => Math.round(n * 100) / 100;

export { normalizeManualLineTotalMdl };

/** Product types whose manual price is the line total kept in their snapshot. */
export const MANUAL_TOTAL_SNAPSHOT_TYPES = [
  "large_format_print",
  "dtf_apparel",
  "uv_print",
  "sublimation_print",
] as const;
/** Product types whose manual price is a price per piece (`OrderLine.manualUnitPriceMdl`). */
export const MANUAL_UNIT_PRICE_TYPES = ["paper_print", "mug", "notebook", "pen"] as const;

export function isManualTotalSnapshotType(pt: string): boolean {
  return (MANUAL_TOTAL_SNAPSHOT_TYPES as readonly string[]).includes(pt);
}
export function isManualUnitPriceType(pt: string): boolean {
  return (MANUAL_UNIT_PRICE_TYPES as readonly string[]).includes(pt);
}

/** Marks a manually priced snapshot carries (top level of the line JSON). */
export interface ManualLinePriceMarks {
  manualTotalSellPriceMdl?: number;
  computedTotalSellPriceMdl?: number;
}

/** How to read / write the sell total and profit of one snapshot shape. */
interface TotalAccess<T> {
  total: (d: T) => number;
  /** `d` with `total` as its sell total; profit moves by the same amount (costs unchanged). */
  withTotal: (d: T, total: number) => T;
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Manual line total stored in a snapshot, or null when the calculator priced it. */
export function storedManualLineTotalMdl(data: unknown): number | null {
  if (data == null || typeof data !== "object") return null;
  return normalizeManualLineTotalMdl((data as ManualLinePriceMarks).manualTotalSellPriceMdl);
}

function stripMarks<T>(data: T, access: TotalAccess<T>): T {
  const marks = data as T & ManualLinePriceMarks;
  if (marks.manualTotalSellPriceMdl === undefined && marks.computedTotalSellPriceMdl === undefined) return data;
  const { manualTotalSellPriceMdl: _m, computedTotalSellPriceMdl: computed, ...rest } = marks;
  void _m;
  const base = rest as unknown as T;
  return finite(computed) ? access.withTotal(base, computed) : base;
}

function applyMarks<T>(data: T, manualMdl: number | null | undefined, access: TotalAccess<T>): T {
  const base = stripMarks(data, access);
  const manual = normalizeManualLineTotalMdl(manualMdl);
  if (manual == null) return base;
  const computed = access.total(base);
  return {
    ...access.withTotal(base, manual),
    manualTotalSellPriceMdl: manual,
    computedTotalSellPriceMdl: computed,
  };
}

const LF_ACCESS: TotalAccess<LargeFormatLineData> = {
  total: (d) => d.totalSellPrice,
  withTotal: (d, total) => {
    const cost = d.totalSellPrice - d.estimatedProfit;
    const out: LargeFormatLineData = { ...d, totalSellPrice: total, estimatedProfit: round2(total - cost) };
    if (finite(d.totalDirectCostMdl) && d.marginPercent !== undefined) {
      out.marginPercent = total > 0 ? Math.round(((total - d.totalDirectCostMdl) / total) * 10000) / 100 : 0;
    }
    return out;
  },
};

type PricedSnapshot = { pricing: { totalSellPriceMdl: number }; costs: { totalCostMdl: number }; estimatedProfitMdl: number };

function pricedAccess<T extends PricedSnapshot>(): TotalAccess<T> {
  return {
    total: (d) => d.pricing.totalSellPriceMdl,
    withTotal: (d, total) => ({
      ...d,
      pricing: { ...d.pricing, totalSellPriceMdl: total },
      estimatedProfitMdl: round2(total - d.costs.totalCostMdl),
    }),
  };
}

/** Large-format snapshot billed at `manualMdl` (null → the calculated total). */
export function applyManualLfLinePrice(data: LargeFormatLineData, manualMdl: number | null | undefined): LargeFormatLineData {
  return applyMarks(data, manualMdl, LF_ACCESS);
}
export function applyManualDtfLinePrice(data: DtfLineData, manualMdl: number | null | undefined): DtfLineData {
  return applyMarks(data, manualMdl, pricedAccess<DtfLineData>());
}
export function applyManualUvLinePrice(data: UvLineData, manualMdl: number | null | undefined): UvLineData {
  return applyMarks(data, manualMdl, pricedAccess<UvLineData>());
}
export function applyManualSublimationLinePrice(
  data: SublimationLineData,
  manualMdl: number | null | undefined,
): SublimationLineData {
  return applyMarks(data, manualMdl, pricedAccess<SublimationLineData>());
}

/**
 * The manual price an edited line ends up with: the request's value when sent
 * (number sets, null clears), else the stored one.
 */
export function resolveManualPriceInput(
  input: number | null | undefined,
  stored: number | null,
): number | null {
  if (input === undefined) return stored;
  return normalizeManualLineTotalMdl(input);
}

/** Stored per-piece manual price of a paper / mug / notebook / pen line (`OrderLine.manualUnitPriceMdl`). */
export function storedManualUnitPriceMdl(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return normalizeManualLineTotalMdl(n);
}
