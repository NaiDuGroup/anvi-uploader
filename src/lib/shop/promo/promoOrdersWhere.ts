import type { Prisma } from "@prisma/client";

/** An unpaid order holds its code this long (parallel unpaid orders cannot exceed the limits). */
export const PROMO_PENDING_HOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Orders that count for a promo code at all: not trashed and not a test
 * payment (closed test). Shared by the checkout limits, the admin list counts
 * and the admin delete protection so they always agree.
 */
export function promoRealOrdersWhere(promoCodeId: string | { in: string[] }): Prisma.OrderWhereInput {
  return {
    promoCodeId,
    deletedAt: null,
    NOT: { paymentProvider: "test" },
  };
}

/** Real unpaid orders placed in the last {@link PROMO_PENDING_HOLD_MS}: they hold the code. */
export function promoHeldOrdersWhere(promoCodeId: string | { in: string[] }, now: Date): Prisma.OrderWhereInput {
  return {
    ...promoRealOrdersWhere(promoCodeId),
    paymentStatus: { not: "paid" },
    createdAt: { gte: new Date(now.getTime() - PROMO_PENDING_HOLD_MS) },
  };
}
