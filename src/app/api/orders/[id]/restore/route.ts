import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import {
  InsufficientMugStockError,
  recordMugStockSale,
} from "@/lib/mug/mugStockLedger";

export async function POST(
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

  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { files: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!order.deletedAt) {
      return NextResponse.json({ error: "Order is not in trash" }, { status: 409 });
    }

    const mugQty =
      order.productType === "mug" && order.mugProductId
        ? mugOrderStockQuantityFromFiles(order.files)
        : 0;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id },
          data: { deletedAt: null },
        });

        if (order.productType === "mug" && order.mugProductId && mugQty > 0) {
          await recordMugStockSale(tx, {
            mugProductId: order.mugProductId,
            quantity: mugQty,
            orderId: order.id,
            orderNumber: order.orderNumber,
            createdById: user.id,
          });
        }

        await tx.orderLog.create({
          data: {
            orderId: id,
            userId: user.id,
            action: "restored",
          },
        });
      });
    } catch (e) {
      if (e instanceof InsufficientMugStockError) {
        return NextResponse.json(
          {
            error: "insufficient_stock",
            requested: e.requested,
            available: e.available,
            mugProductId: e.mugProductId,
          },
          { status: 409 },
        );
      }
      throw e;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to restore order:", error);
    return NextResponse.json(
      { error: "Failed to restore order" },
      { status: 500 },
    );
  }
}
