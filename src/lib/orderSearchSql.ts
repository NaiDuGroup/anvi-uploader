import { Prisma } from "@prisma/client";
import { PHONE_LOCAL_SQL_PREFIX, phoneQueryDigits, stripMoldovaPrefix } from "./phoneNormalize";

/** Largest value of the int4 `orders.order_number` column. */
const MAX_ORDER_NUMBER = 2_147_483_647;

/**
 * Order number a search box query names: «10300» or «#10300». Null for
 * anything else (or a number too big for the column).
 */
export function orderNumberFromSearch(search: string): number | null {
  const m = /^#?\s*(\d{1,10})$/.exec(search.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n <= MAX_ORDER_NUMBER ? n : null;
}

/** `orders.phone` with every non-digit removed. */
const PHONE_DIGITS = Prisma.sql`regexp_replace(phone, '[^0-9]', '', 'g')`;
/** …and without a leading Moldova `373` / `0` (see `stripMoldovaPrefix`). */
const PHONE_LOCAL = Prisma.sql`regexp_replace(${PHONE_DIGITS}, ${PHONE_LOCAL_SQL_PREFIX}, '')`;

/**
 * `AND (…)` filter on `orders` for the staff search box (Заказы, Цех board +
 * sidebar). Always the old plain `phone LIKE %q%`, plus:
 * - a phone-like query (digits after dropping spaces, `+ - ( ) .`, ≥ 3) is
 *   matched format-insensitively: digits vs the phone's digits, and the local
 *   part vs the phone's local part, so «+373 68 900999», «068900999» and
 *   «900999» all find «+373 68 900 999»;
 * - «10300» / «#10300» also matches the order number.
 * Empty SQL for an empty query.
 */
export function orderSearchSql(rawSearch: string): Prisma.Sql {
  const search = rawSearch.trim();
  if (!search) return Prisma.empty;

  const conds: Prisma.Sql[] = [Prisma.sql`phone LIKE ${"%" + search + "%"}`];
  const digits = phoneQueryDigits(search);
  if (digits) {
    conds.push(Prisma.sql`${PHONE_DIGITS} LIKE ${"%" + digits + "%"}`);
    const local = stripMoldovaPrefix(digits);
    if (local !== digits && local.length >= 3) {
      conds.push(Prisma.sql`${PHONE_LOCAL} LIKE ${"%" + local + "%"}`);
    }
  }
  const orderNumber = orderNumberFromSearch(search);
  if (orderNumber != null) conds.push(Prisma.sql`order_number = ${orderNumber}`);

  return Prisma.sql`AND (${Prisma.join(conds, " OR ")})`;
}
