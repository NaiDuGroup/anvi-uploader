/**
 * What the storefront customer sees as their order's state. Pure (client-safe).
 */
export const SHOP_CUSTOMER_STATUSES = [
  "pending_payment",
  "accepted",
  "paid",
  "in_production",
  "shipped",
  "delivered",
  "issue",
] as const;
export type ShopCustomerStatus = (typeof SHOP_CUSTOMER_STATUSES)[number];

export interface ShopCustomerStatusInput {
  /** Internal `Order.status` (NEW … DELIVERED, ISSUE). */
  status: string;
  paymentStatus: string;
  isPaid: boolean;
  shippedAt: Date | string | null;
  /** `on_delivery`: paid at hand-over — never «awaiting payment». */
  paymentProvider?: string | null;
  /**
   * Treat an unpaid order as pay-on-delivery whatever its provider: the
   * «Оплата только при получении» switch is on (old online orders included).
   */
  payOnDelivery?: boolean;
}

/** Unpaid and paid at hand-over: `on_delivery` provider, or the switch is on. */
export function shopOrderPaysOnDelivery(order: ShopCustomerStatusInput): boolean {
  if (order.paymentStatus === "paid" || order.isPaid) return false;
  return order.payOnDelivery === true || order.paymentProvider === "on_delivery";
}

/**
 * Internal status → customer status. Order of precedence:
 * ISSUE → issue; DELIVERED → delivered; not paid → pending_payment (pay on
 * delivery: NEW → accepted, then shipped / in_production as if paid);
 * shipped (EVS sent) → shipped; NEW → paid (waiting to start);
 * anything else (in the studio / workshop / ready / back in studio) → in_production.
 * «Paid» is the provider's `paymentStatus='paid'` or the staff's `isPaid`.
 */
export function shopCustomerStatus(order: ShopCustomerStatusInput): ShopCustomerStatus {
  if (order.status === "ISSUE") return "issue";
  if (order.status === "DELIVERED") return "delivered";
  const paid = order.paymentStatus === "paid" || order.isPaid;
  if (!paid && shopOrderPaysOnDelivery(order)) {
    if (order.shippedAt) return "shipped";
    return order.status === "NEW" ? "accepted" : "in_production";
  }
  if (!paid) return "pending_payment";
  if (order.shippedAt) return "shipped";
  if (order.status === "NEW") return "paid";
  return "in_production";
}
