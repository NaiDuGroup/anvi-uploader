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

/**
 * `Order.paymentProvider`: `on_delivery` = paid at hand-over (cash or card), set
 * while «Оплата только при получении» is on (`shopPayOnDelivery`).
 */
export const SHOP_PAYMENT_PROVIDERS = ["test", "paynet", "on_delivery"] as const;
export type ShopPaymentProvider = (typeof SHOP_PAYMENT_PROVIDERS)[number];

export const SHOP_DELIVERY_METHODS = ["pickup", "courier_chisinau", "courier_moldova"] as const;
export type ShopDeliveryMethod = (typeof SHOP_DELIVERY_METHODS)[number];

/** Courier methods need a city and an address. */
export function deliveryNeedsAddress(method: ShopDeliveryMethod): boolean {
  return method !== "pickup";
}

/**
 * Minimum amount payable for a storefront order with a promo code, lei (owner
 * decision 2026-11: payment gateways refuse 0 lei). A promo discount never
 * brings `subtotal + delivery − discount` below this; when the order already
 * costs this much or less, the code gives nothing. Orders without a code are
 * not affected.
 */
export const SHOP_MIN_PAYABLE_MDL = 10;

/** Max cart lines in one storefront order. */
export const SHOP_CHECKOUT_MAX_LINES = 30;
/** Max files attached to one cart line. */
export const SHOP_CHECKOUT_MAX_FILES_PER_LINE = 20;

/**
 * Storefront order files are copied out of the lifecycle-expired `uploads/`
 * prefix into this one at checkout, so they live until the order is done.
 */
export const SHOP_ORDER_FILE_PREFIX = "shop-orders/";
