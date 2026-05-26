import { Prisma } from "@prisma/client";

/**
 * Wrap a numeric MDL price into a `Prisma.Decimal` rounded to 2 decimal
 * places (bani) so it lands in the `orders.price DECIMAL(12, 2)` column
 * exactly as displayed in the UI, with no float drift.
 *
 * The Prisma client accepts `number | string | Decimal` on Decimal
 * columns; we go through `toFixed(2)` → `new Prisma.Decimal(...)` for
 * the same reason `computeInvoiceTotals` does — `Number(1.1) + Number(0.2)`
 * is `1.3000000000000003`, which Prisma will happily persist if you let
 * it.
 */
export function toOrderPriceDecimal(
  value: number | null | undefined,
): Prisma.Decimal | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Prisma.Decimal(value.toFixed(2));
}

/**
 * Inverse of {@link toOrderPriceDecimal} for API responses. Serialises a
 * Prisma `Decimal` (the DB shape) as a plain JS number so existing
 * client TS types (`order.price: number | null`) keep working without
 * pulling Decimal into the bundle.
 */
export function serializeOrderPrice(
  value: Prisma.Decimal | null | undefined,
): number | null {
  if (value == null) return null;
  return Number(value.toString());
}

/**
 * Convenience helper to JSON-serialise an order row that has `price` as
 * a `Prisma.Decimal`. Keeps all other fields intact.
 */
export function serializeOrderWithPrice<
  T extends { price: Prisma.Decimal | null | undefined },
>(order: T): Omit<T, "price"> & { price: number | null } {
  const { price, ...rest } = order;
  return { ...rest, price: serializeOrderPrice(price) };
}
