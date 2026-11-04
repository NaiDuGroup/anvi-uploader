import type { Prisma } from "@prisma/client";

/**
 * Storefront order flags shared by the admin, the cabinet and the debt
 * aggregates. Pure (client-safe; the Prisma import is type-only).
 */

/** Prefix of `Order.notes` for orders placed while the fake `test` payment provider runs. */
export const SHOP_TEST_ORDER_NOTE_PREFIX = "[ТЕСТ сайт]";

/**
 * A storefront test order: created while the test payment provider was active
 * (`paymentProvider='test'`, notes prefixed with {@link SHOP_TEST_ORDER_NOTE_PREFIX}).
 * Such orders deduct no stock and are not linked to a registry client.
 */
export function isShopTestOrder(order: {
  source?: string | null;
  paymentProvider?: string | null;
  notes?: string | null;
}): boolean {
  if (order.source !== "shop") return false;
  return order.paymentProvider === "test" || (order.notes ?? "").startsWith(SHOP_TEST_ORDER_NOTE_PREFIX);
}

/** A storefront order whose online payment has not gone through (yet). */
export function isUnpaidShopOrder(order: { source?: string | null; paymentStatus?: string | null }): boolean {
  return order.source === "shop" && order.paymentStatus !== "paid";
}

/**
 * Prisma condition matching unpaid storefront orders. They are prepaid online:
 * until the payment goes through they are not the client's debt and do not
 * show in the dealer cabinet. Use as `{ ..., NOT: UNPAID_SHOP_ORDER_WHERE }`.
 */
export const UNPAID_SHOP_ORDER_WHERE = {
  source: "shop",
  paymentStatus: { not: "paid" },
} as const satisfies Prisma.OrderWhereInput;

/**
 * Whether an order adds to the client's debt («De plată»): not paid by staff
 * (`isPaid=false`) and not an unpaid storefront order.
 */
export function countsTowardClientDebt(order: {
  isPaid: boolean;
  source?: string | null;
  paymentStatus?: string | null;
}): boolean {
  return !order.isPaid && !isUnpaidShopOrder(order);
}

/**
 * Storefront orders cannot be re-saved in the admin order wizard: it would
 * re-price the lines and drop the paid delivery from `Order.price`.
 */
export const SHOP_ORDER_EDIT_BLOCKED_MESSAGE =
  "Заказ с сайта нельзя редактировать в мастере: цена (позиции + доставка) оплачена клиентом онлайн. Статус, оплату, заметки и трек-номер меняйте в списке заказов.";
