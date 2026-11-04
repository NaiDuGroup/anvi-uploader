import { SHOP_ORDER_FILE_PREFIX } from "./constants";

/**
 * Status-change rules that differ for storefront orders. Pure (client-safe).
 */

/**
 * Setting DELIVERED marks a studio order paid (cash at hand-over). Storefront
 * orders are prepaid online: their paid flag comes from the payment provider,
 * so delivery never flips it.
 */
export function deliveredAutoMarksPaid(order: { source: string | null | undefined }): boolean {
  return order.source !== "shop";
}

/** Days a finished storefront order keeps its files, counted from the order's creation. */
export const SHOP_ORDER_FILE_MIN_RETENTION_DAYS = 14;
/** An unpaid storefront order is abandoned after this many days: its files may go. */
export const SHOP_ORDER_ABANDONED_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ShopOrderRetentionInput {
  source: string;
  status: string;
  paymentStatus: string;
  isPaid: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  /** Linked storefront account: its files stay while they belong to the account. */
  shopCustomerId?: string | null;
}

/**
 * Whether a storefront order's files (copied under `shop-orders/`, outside the
 * 7-day `uploads/` lifecycle) may be deleted now. They stay until the order is
 * DELIVERED or cancelled (moved to trash) — and at least
 * {@link SHOP_ORDER_FILE_MIN_RETENTION_DAYS} days after creation. An order
 * never paid is released after {@link SHOP_ORDER_ABANDONED_DAYS} days.
 * Studio orders are never selected (their files follow the R2 lifecycle).
 *
 * Account orders (`shopCustomerId` set) keep their files after delivery —
 * «Fișierele mele» / «Repetă comanda»; the customer deletes them there. Only
 * an account order never paid is released, after the same 30 days.
 */
export function shopOrderFilesReleasable(order: ShopOrderRetentionInput, now: Date = new Date()): boolean {
  if (order.source !== "shop") return false;
  const ageMs = now.getTime() - order.createdAt.getTime();
  const paidNow = order.isPaid || order.paymentStatus === "paid";
  if (order.shopCustomerId) return !paidNow && ageMs >= SHOP_ORDER_ABANDONED_DAYS * DAY_MS;
  const done = order.status === "DELIVERED" || order.deletedAt != null;
  if (done) return ageMs >= SHOP_ORDER_FILE_MIN_RETENTION_DAYS * DAY_MS;
  const paid = order.isPaid || order.paymentStatus === "paid";
  return !paid && ageMs >= SHOP_ORDER_ABANDONED_DAYS * DAY_MS;
}

/** Storage key of a storefront copy of an order upload: `uploads/x` → `shop-orders/x`. */
export function shopOrderFileKey(uploadKey: string): string {
  const k = uploadKey.replace(/^\//, "");
  return SHOP_ORDER_FILE_PREFIX + (k.startsWith("uploads/") ? k.slice("uploads/".length) : k);
}

export function isShopOrderFileKey(key: string): boolean {
  return key.replace(/^\//, "").startsWith(SHOP_ORDER_FILE_PREFIX);
}

/**
 * Storage keys that may really be deleted: a repeated account order reuses
 * the same `shop-orders/…` object, so a key still referenced by a File row
 * of an order that keeps its files stays (only the released rows are marked).
 */
export function shopKeysSafeToDelete(keys: readonly string[], stillReferenced: ReadonlySet<string>): string[] {
  return [...new Set(keys)].filter((k) => !stillReferenced.has(k));
}
