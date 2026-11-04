/**
 * Storefront (shop) order constants shared by checkout, the payment providers,
 * the public order page and the admin. Pure module (client-safe).
 */

/** `Order.source`: walk-in / admin / cabinet orders vs storefront checkout. */
export const ORDER_SOURCES = ["studio", "shop"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/** `Order.paymentStatus` (online payment of storefront orders). */
export const SHOP_PAYMENT_STATUSES = ["unpaid", "pending", "paid", "failed", "refunded"] as const;
export type ShopPaymentStatus = (typeof SHOP_PAYMENT_STATUSES)[number];

export const SHOP_PAYMENT_PROVIDERS = ["test", "paynet"] as const;
export type ShopPaymentProvider = (typeof SHOP_PAYMENT_PROVIDERS)[number];

export const SHOP_DELIVERY_METHODS = ["pickup", "courier_chisinau", "courier_moldova"] as const;
export type ShopDeliveryMethod = (typeof SHOP_DELIVERY_METHODS)[number];

/** Courier methods need a city and an address. */
export function deliveryNeedsAddress(method: ShopDeliveryMethod): boolean {
  return method !== "pickup";
}

/** Max cart lines in one storefront order. */
export const SHOP_CHECKOUT_MAX_LINES = 30;
/** Max files attached to one cart line. */
export const SHOP_CHECKOUT_MAX_FILES_PER_LINE = 20;

/**
 * Storefront order files are copied out of the lifecycle-expired `uploads/`
 * prefix into this one at checkout, so they live until the order is done.
 */
export const SHOP_ORDER_FILE_PREFIX = "shop-orders/";
