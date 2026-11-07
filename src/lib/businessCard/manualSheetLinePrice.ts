/**
 * Staff «ручная цена» on a sheet-product line (business cards, flyers, sticker
 * sheets): the line total typed in the wizard's price field.
 *
 * Stored on `businessCardLineData` itself so it survives order edits:
 *  - `totalSellPriceMdl` / `estimatedProfitMdl` carry the manual figure, so every
 *    reader (order views, dealer prices, cabinet) shows what the client pays;
 *  - `manualTotalSellPriceMdl` marks the line as manually priced;
 *  - `computedTotalSellPriceMdl` keeps the calculated price for reference and
 *    for going back to it when staff clear the field.
 *
 * The manual price stays until staff clear it — also when the run or size
 * changes (the wizard then shows it as manual next to the new calculated price).
 * Dealers never send it (their schemas omit the field; the server prices).
 */

import type { BusinessCardLineData } from "./types";
import { keepStoredSheetLinePricing, sheetLineRunUnchanged } from "./keepStoredSheetLinePricing";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Valid manual line total (MDL, ≥ 0) or null. */
export function normalizeManualLineTotalMdl(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? round2(v) : null;
}

/** Manual line total stored on the line, or null when the line is priced by the calculator. */
export function storedManualSheetLineTotalMdl(data: Pick<BusinessCardLineData, "manualTotalSellPriceMdl">): number | null {
  return normalizeManualLineTotalMdl(data.manualTotalSellPriceMdl);
}

/** The line as the calculator priced it (manual marks removed, calculated total restored). */
export function withoutManualSheetLinePrice(data: BusinessCardLineData): BusinessCardLineData {
  if (storedManualSheetLineTotalMdl(data) == null && data.computedTotalSellPriceMdl === undefined) return data;
  const { manualTotalSellPriceMdl: _m, computedTotalSellPriceMdl: computed, ...rest } = data;
  void _m;
  const total = typeof computed === "number" && Number.isFinite(computed) ? computed : data.totalSellPriceMdl;
  return {
    ...rest,
    totalSellPriceMdl: total,
    estimatedProfitMdl: round2(total - (data.paperCostMdl ?? 0)),
  };
}

/** `data` billed at `manualMdl` (null → the calculated price). */
export function applyManualSheetLinePrice(
  data: BusinessCardLineData,
  manualMdl: number | null | undefined,
): BusinessCardLineData {
  const base = withoutManualSheetLinePrice(data);
  const manual = normalizeManualLineTotalMdl(manualMdl);
  if (manual == null) return base;
  return {
    ...base,
    totalSellPriceMdl: manual,
    estimatedProfitMdl: round2(manual - (base.paperCostMdl ?? 0)),
    manualTotalSellPriceMdl: manual,
    computedTotalSellPriceMdl: base.totalSellPriceMdl,
  };
}

/**
 * Order edit of a sheet line: `next` = the line re-resolved now, `prev` = as
 * stored (null for a new line), `manualInput` = the request's manual total
 * (number sets, null clears, undefined — dealer edits — keeps the stored one
 * while the run is unchanged). An unchanged run keeps its sold calculated price.
 */
export function priceEditedSheetLine(
  next: BusinessCardLineData,
  prev: BusinessCardLineData | null,
  manualInput: number | null | undefined,
): BusinessCardLineData {
  const priced = keepStoredSheetLinePricing(next, prev ? withoutManualSheetLinePrice(prev) : null);
  const manual =
    manualInput !== undefined
      ? manualInput
      : prev && sheetLineRunUnchanged(next, prev)
        ? storedManualSheetLineTotalMdl(prev)
        : null;
  return applyManualSheetLinePrice(priced, manual);
}
