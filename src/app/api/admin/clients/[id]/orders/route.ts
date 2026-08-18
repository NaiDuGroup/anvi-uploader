import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { serializeOrderPrice } from "@/lib/orderPriceDecimal";
import { round2 } from "@/lib/money";

/**
 * Order history + money summary for one registry client (admin client card).
 * Debt matches the cabinet's "De plată": sum of unpaid, non-deleted orders.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const client = await prisma.studioCustomer.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const orders = await prisma.order.findMany({
    where: { clientId: id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      orderNumber: true,
      productType: true,
      status: true,
      price: true,
      isPaid: true,
      paidAt: true,
      createdAt: true,
      notes: true,
    },
  });

  let unpaidTotalMdl = 0;
  let unpaidCount = 0;
  let paidTotalMdl = 0;
  for (const o of orders) {
    const price = serializeOrderPrice(o.price);
    if (o.isPaid) {
      if (price !== null) paidTotalMdl += price;
    } else {
      unpaidCount += 1;
      if (price !== null) unpaidTotalMdl += price;
    }
  }

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      productType: o.productType,
      status: o.status,
      price: serializeOrderPrice(o.price),
      isPaid: o.isPaid,
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      createdAt: o.createdAt.toISOString(),
      notes: o.notes ?? null,
    })),
    summary: {
      ordersCount: orders.length,
      unpaidCount,
      unpaidTotalMdl: round2(unpaidTotalMdl),
      paidTotalMdl: round2(paidTotalMdl),
    },
  });
}
