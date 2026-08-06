import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

const bodySchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(500),
});

/**
 * POST /api/orders/mark-all-read
 *
 * Marks all internal comments and client messages on the given orders as read
 * for the current user. Called by the "Mark all as read" button that appears
 * next to the unread-comment badge in the admin orders header.
 *
 * Body: { orderIds: string[] }
 * Response: { ok: true }
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let orderIds: string[];
  try {
    const body = bodySchema.parse(await request.json());
    orderIds = body.orderIds;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const now = new Date();

  // Bulk-upsert comment_reads and client_message_reads in one transaction.
  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO comment_reads (id, order_id, user_id, read_at)
      SELECT gen_random_uuid(), unnest(${orderIds}::uuid[]), ${user.id}::uuid, ${now}
      ON CONFLICT (order_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at
    `,
    prisma.$executeRaw`
      INSERT INTO client_message_reads (id, order_id, user_id, read_at)
      SELECT gen_random_uuid(), unnest(${orderIds}::uuid[]), ${user.id}::uuid, ${now}
      ON CONFLICT (order_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at
    `,
  ]);

  return NextResponse.json({ ok: true });
}
