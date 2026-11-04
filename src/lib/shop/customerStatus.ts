/**
 * What the storefront customer sees as their order's state. Pure (client-safe).
 */
export const SHOP_CUSTOMER_STATUSES = [
  "pending_payment",
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
}

/**
 * Internal status → customer status. Order of precedence:
 * ISSUE → issue; DELIVERED → delivered; not paid → pending_payment;
 * shipped (EVS sent) → shipped; NEW → paid (waiting to start);
 * anything else (in the studio / workshop / ready / back in studio) → in_production.
 * «Paid» is the provider's `paymentStatus='paid'` or the staff's `isPaid`.
 */
export function shopCustomerStatus(order: ShopCustomerStatusInput): ShopCustomerStatus {
  if (order.status === "ISSUE") return "issue";
  if (order.status === "DELIVERED") return "delivered";
  const paid = order.paymentStatus === "paid" || order.isPaid;
  if (!paid) return "pending_payment";
  if (order.shippedAt) return "shipped";
  if (order.status === "NEW") return "paid";
  return "in_production";
}
