import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { serializeOrderPrice } from "@/lib/orderPriceDecimal";
import { round2 } from "@/lib/money";

const bodySchema = z.object({
  /** Limit to specific orders; omit to settle every unpaid order of the client. */
  orderIds: z.array(z.string().min(1)).max(500).optional(),
});

/**
 * Bulk "client paid" action for the admin client card: marks the client's
 * unpaid orders as paid (all of them, or the requested subset) and writes an
 * `isPaid` change entry into each order's log, mirroring what the manual
 * per-order toggle does. Already-paid orders are ignored, so repeating the
 * call is harmless.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await params;
  const client = await prisma.studioCustomer.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const targets = await prisma.order.findMany({
    where: {
      clientId: id,
      deletedAt: null,
      isPaid: false,
      ...(parsed.data.orderIds ? { id: { in: parsed.data.orderIds } } : {}),
    },
    select: { id: true, price: true },
  });

  if (targets.length === 0) {
    return NextResponse.json({ paidCount: 0, paidTotalMdl: 0 });
  }

  const paidAt = new Date();
  const targetIds = targets.map((o) => o.id);
  await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: { in: targetIds }, isPaid: false },
      data: { isPaid: true, paidAt },
    }),
    prisma.orderLog.createMany({
      data: targetIds.map((orderId) => ({
        orderId,
        userId: user.id,
        action: "field_updated",
        field: "isPaid",
        oldValue: "false",
        newValue: "true",
      })),
    }),
  ]);

  const paidTotalMdl = round2(
    targets.reduce((sum, o) => sum + (serializeOrderPrice(o.price) ?? 0), 0),
  );

  return NextResponse.json({ paidCount: targets.length, paidTotalMdl });
}
