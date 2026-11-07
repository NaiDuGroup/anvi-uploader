/**
 * Order edit: a sheet-product line (business cards, flyers) whose run did not
 * change keeps the price it was sold at.
 *
 * The admin edit re-resolves every line, so without this an unrelated save
 * (a phone, a note, another line) would silently re-price an old line at
 * today's rate — e.g. a business-card order billed per sheet (sheets × 14)
 * would jump to the shop's per-card price. Only a change to what drives the
 * price (paper, quantity, sides, tier, size, product) re-prices the line.
 */

import type { BusinessCardLineData } from "./types";
import { businessCardTrimSize } from "./parseBusinessCardLineData";
import { samePostcardPricing } from "@/lib/postcard/postcard";

/** Fields that carry the line's sold price and cost, frozen at order time. */
const PRICING_KEYS = [
  "paperSnapshot",
  "pricePerSheetMdl",
  "totalSellPriceMdl",
  "paperCostMdl",
  "avgPaperCostPerSheetSnapshot",
  "estimatedProfitMdl",
  "pricingSource",
  "pricePerCardMdl",
  "minimumLineTotalSettingMdl",
  "minimumLineUpliftMdl",
] as const satisfies readonly (keyof BusinessCardLineData)[];

const sameCm = (a: number, b: number): boolean => Math.abs(a - b) < 0.001;

/** Sticker sheets: shape, cut and sheet format drive the price too. */
function sameSticker(
  a: BusinessCardLineData["stickerSheet"],
  b: BusinessCardLineData["stickerSheet"],
): boolean {
  if (!a || !b) return !a && !b;
  return a.shape === b.shape && a.cut === b.cut && a.format === b.format;
}

/** True when nothing that drives the price differs between the stored and the re-resolved line. */
export function sheetLineRunUnchanged(
  next: BusinessCardLineData,
  prev: BusinessCardLineData,
): boolean {
  const nt = businessCardTrimSize(next);
  const pt = businessCardTrimSize(prev);
  return (
    next.paperSnapshot.id === prev.paperSnapshot.id &&
    next.quantity === prev.quantity &&
    next.sides === prev.sides &&
    next.customerType === prev.customerType &&
    sameCm(nt.widthCm, pt.widthCm) &&
    sameCm(nt.heightCm, pt.heightCm) &&
    sameSticker(next.stickerSheet, prev.stickerSheet) &&
    samePostcardPricing(next.postcard, prev.postcard)
  );
}

/**
 * `next` with the stored line's price and cost when the run is unchanged
 * (`prev` = the line as stored, null for a new line); otherwise `next` as is.
 */
export function keepStoredSheetLinePricing(
  next: BusinessCardLineData,
  prev: BusinessCardLineData | null,
): BusinessCardLineData {
  if (!prev || !sheetLineRunUnchanged(next, prev)) return next;
  const out: Record<string, unknown> = { ...next };
  for (const k of PRICING_KEYS) {
    if (prev[k] === undefined) delete out[k];
    else out[k] = prev[k];
  }
  return out as unknown as BusinessCardLineData;
}
