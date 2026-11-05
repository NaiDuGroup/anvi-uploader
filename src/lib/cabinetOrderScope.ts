import type { Prisma } from "@prisma/client";

/**
 * Orders the cabinet shows (list, detail, chat, file preview): live orders
 * plus orders the dealer cancelled. A dealer cancel soft-deletes the order
 * (`deletedAt`, so it leaves debt, boards and queues) but keeps
 * `cancelledAt`, and the cabinet keeps showing it greyed as «Отменён».
 * Orders deleted by the staff stay hidden. Combine with the owner filter
 * (`clientId`) and `NOT: UNPAID_SHOP_ORDER_WHERE`.
 */
export const CABINET_VISIBLE_ORDER_WHERE = {
  OR: [{ deletedAt: null }, { cancelledAt: { not: null } }],
} as const satisfies Prisma.OrderWhereInput;
