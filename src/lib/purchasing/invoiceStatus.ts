import { PurchaseInvoiceStatus, PurchaseLineStatus } from "./types";

/** Invoice status derived from its lines. */
export function deriveInvoiceStatus(lineStatuses: readonly string[]): PurchaseInvoiceStatus {
  if (lineStatuses.length === 0) return PurchaseInvoiceStatus.New;
  const posted: number = lineStatuses.filter((s) => s === PurchaseLineStatus.Posted).length;
  const ignored: number = lineStatuses.filter((s) => s === PurchaseLineStatus.Ignored).length;
  const done: number = posted + ignored;

  if (done === lineStatuses.length) {
    return posted > 0 ? PurchaseInvoiceStatus.Posted : PurchaseInvoiceStatus.Ignored;
  }
  return posted > 0 ? PurchaseInvoiceStatus.PartiallyPosted : PurchaseInvoiceStatus.NeedsReview;
}

/** Auto-posting is skipped when the unit price jumps more than this vs the last invoice. */
export const AUTO_POST_MAX_PRICE_DRIFT = 0.3;

export function isPriceDriftSuspicious(
  lastUnitPrice: number | null,
  currentUnitPrice: number | null,
): boolean {
  if (lastUnitPrice == null || currentUnitPrice == null || lastUnitPrice <= 0) return false;
  return Math.abs(currentUnitPrice - lastUnitPrice) / lastUnitPrice > AUTO_POST_MAX_PRICE_DRIFT;
}
