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

/** `Order.paymentProvider` of storefront orders paid at hand-over («Оплата при получении»). */
export const SHOP_ON_DELIVERY_PROVIDER = "on_delivery";

/**
 * A storefront order paid on delivery (cash / card at hand-over): placed while
 * «Оплата только при получении» was on. It goes to work at once, like a studio
 * order; staff mark it paid (DELIVERED does it too).
 */
export function isPayOnDeliveryShopOrder(order: { source?: string | null; paymentProvider?: string | null }): boolean {
  return order.source === "shop" && order.paymentProvider === SHOP_ON_DELIVERY_PROVIDER;
}

/**
 * A storefront order whose online payment has not gone through (yet).
 * Pay-on-delivery orders are not: they are owed like studio orders.
 */
export function isUnpaidShopOrder(order: {
  source?: string | null;
  paymentStatus?: string | null;
  paymentProvider?: string | null;
}): boolean {
  return order.source === "shop" && order.paymentStatus !== "paid" && !isPayOnDeliveryShopOrder(order);
}

/**
 * Prisma condition matching unpaid storefront orders. They are prepaid online:
 * until the payment goes through they are not the client's debt and do not
 * show in the dealer cabinet. Use as `{ ..., NOT: UNPAID_SHOP_ORDER_WHERE }`.
 * Pay-on-delivery orders are not matched (`paymentProvider` null is kept in:
 * SQL `<>` alone would drop it).
 */
export const UNPAID_SHOP_ORDER_WHERE = {
  source: "shop",
  paymentStatus: { not: "paid" },
  OR: [{ paymentProvider: null }, { paymentProvider: { not: SHOP_ON_DELIVERY_PROVIDER } }],
} as const satisfies Prisma.OrderWhereInput;

/**
 * Whether an order adds to the client's debt («De plată»): not paid by staff
 * (`isPaid=false`) and not an unpaid storefront order.
 */
export function countsTowardClientDebt(order: {
  isPaid: boolean;
  source?: string | null;
  paymentStatus?: string | null;
  paymentProvider?: string | null;
}): boolean {
  return !order.isPaid && !isUnpaidShopOrder(order);
}

/**
 * Storefront orders cannot be re-saved in the admin order wizard: it would
 * re-price the lines and drop the paid delivery from `Order.price`.
 */
export const SHOP_ORDER_EDIT_BLOCKED_MESSAGE =
  "Заказ с сайта нельзя редактировать в мастере: цена (позиции + доставка) оплачена клиентом онлайн. Статус, оплату, заметки и трек-номер меняйте в списке заказов.";

/** Head of the storefront checkout's auto notes (see `buildShopStaffNotes`): «Сайт · Самовывоз…». */
const SHOP_AUTO_NOTE_HEAD = "Сайт · ";
/** Rows the checkout writes after the head: «1) …», «…и ещё 3 позиции», «Промокод X: −50 MDL». */
const SHOP_AUTO_NOTE_ROW = /^(\d+\) |…и ещё \d+ |Промокод )/;
/** A customer's own line note inside an auto row: «1) Баннер … — прим.: срочно». */
const SHOP_AUTO_NOTE_COMMENT = / — прим\.: (.+)$/;

export interface ShopOrderNotesParts {
  /** The notes start with the checkout's auto summary («Сайт · …», optionally after the test prefix). */
  auto: boolean;
  /** The auto summary as written (head + line rows), for a muted one-liner / tooltip. */
  summary: string;
  /** Customer line notes found in the auto rows («прим.: …»). */
  comments: string[];
  /** Any other lines (staff-written): shown as a normal sticky note. */
  extra: string[];
}

/**
 * Splits a storefront order's `notes` into the checkout's auto summary (it repeats
 * the lines and the delivery strip), the customer's own line notes, and anything
 * staff added. Non-auto notes come back as `auto: false` with every line in `extra`.
 */
export function splitShopOrderNotes(notes: string | null | undefined): ShopOrderNotesParts {
  const text = (notes ?? "").trim();
  const body = text.startsWith(SHOP_TEST_ORDER_NOTE_PREFIX)
    ? text.slice(SHOP_TEST_ORDER_NOTE_PREFIX.length).trimStart()
    : text;
  const lines = body.split("\n");
  if (!body.startsWith(SHOP_AUTO_NOTE_HEAD)) {
    return { auto: false, summary: "", comments: [], extra: text ? text.split("\n") : [] };
  }
  const summary: string[] = [lines[0]!];
  const comments: string[] = [];
  const extra: string[] = [];
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    if (SHOP_AUTO_NOTE_ROW.test(line)) {
      summary.push(line);
      const m = SHOP_AUTO_NOTE_COMMENT.exec(line);
      if (m) comments.push(m[1]!.trim());
    } else {
      extra.push(line);
    }
  }
  return { auto: true, summary: summary.join("\n"), comments, extra };
}
