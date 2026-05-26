import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { serializeOrderPrice } from "@/lib/orderPriceDecimal";

/**
 * Lightweight orders query used by the invoice "+ Add line from order"
 * picker. Returns just the columns needed to populate an invoice line item.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId")?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: { clientId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      orderNumber: true,
      productType: true,
      price: true,
      status: true,
      createdAt: true,
      notes: true,
    },
  });
  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      productType: o.productType,
      price: serializeOrderPrice(o.price),
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      notes: o.notes ?? null,
    })),
  });
}
