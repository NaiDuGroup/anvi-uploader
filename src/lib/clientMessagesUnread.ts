import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Per-order count of client-channel messages that are unread for `userId`.
 *
 * "Unread" = newer than the reader's `client_message_reads` watermark AND
 * authored by the OTHER party:
 *   - audience "customer" → counts staff messages (role != customer)
 *   - audience "staff"    → counts customer messages (role = customer)
 * so staff are only notified about client replies, not colleagues' outgoing
 * messages, and clients are only notified about studio replies.
 */
export async function getUnreadClientMessageCountMap(
  orderIds: string[],
  userId: string,
  audience: "staff" | "customer",
): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const authorFilter =
    audience === "staff"
      ? Prisma.sql`u.role = 'customer'`
      : Prisma.sql`u.role <> 'customer'`;
  const rows = await prisma.$queryRaw<Array<{ order_id: string; cnt: bigint }>>(
    Prisma.sql`
      SELECT m.order_id, COUNT(*)::bigint AS cnt
      FROM client_messages m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN client_message_reads r
        ON r.order_id = m.order_id AND r.user_id = ${userId}
      WHERE m.order_id = ANY(${orderIds})
        AND ${authorFilter}
        AND (r.read_at IS NULL OR m.created_at > r.read_at)
      GROUP BY m.order_id
    `,
  );
  return new Map(rows.map((r) => [r.order_id, Number(r.cnt)]));
}

/** Total unread studio messages across all of a customer's (non-deleted) orders. */
export async function getTotalUnreadClientMessagesForCustomer(
  studioCustomerId: string,
  userId: string,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ cnt: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS cnt
      FROM client_messages m
      JOIN orders o ON o.id = m.order_id
      JOIN users u ON u.id = m.user_id
      LEFT JOIN client_message_reads r
        ON r.order_id = m.order_id AND r.user_id = ${userId}
      WHERE o.client_id = ${studioCustomerId}
        AND o.deleted_at IS NULL
        AND u.role <> 'customer'
        AND (r.read_at IS NULL OR m.created_at > r.read_at)
    `,
  );
  return rows.length > 0 ? Number(rows[0].cnt) : 0;
}
