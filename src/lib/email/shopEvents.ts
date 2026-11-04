/** Storefront order e-mail events. Pure (unit-tested). */
export type ShopOrderEvent = "created" | "paid" | "shipped" | "ready";

/**
 * Which e-mails an admin update of a storefront order triggers. Pure.
 * - shipped: «Отправлен» just set, or a tracking number added / changed
 *   on an order already shipped (then `force`, so the customer gets the number);
 * - ready: status changed to READY_IN_STUDIO (pickup orders only, checked when sending).
 */
export function adminUpdateShopEvents(
  before: { source: string; status: string; shippedAt: Date | null; trackingNumber: string | null },
  after: { status: string; shippedAt: Date | null; trackingNumber: string | null },
): { event: ShopOrderEvent; force?: boolean }[] {
  if (before.source !== "shop") return [];
  const out: { event: ShopOrderEvent; force?: boolean }[] = [];
  const justShipped = before.shippedAt == null && after.shippedAt != null;
  const trackingChanged = after.trackingNumber != null && after.trackingNumber !== before.trackingNumber;
  if (justShipped) out.push({ event: "shipped" });
  else if (after.shippedAt != null && trackingChanged) out.push({ event: "shipped", force: true });
  if (after.status === "READY_IN_STUDIO" && before.status !== "READY_IN_STUDIO") out.push({ event: "ready" });
  return out;
}
