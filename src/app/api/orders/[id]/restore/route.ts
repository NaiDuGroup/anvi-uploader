import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";

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
      select: { id: true, deletedAt: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!order.deletedAt) {
      return NextResponse.json({ error: "Order is not in trash" }, { status: 409 });
    }

    await prisma.order.update({
      where: { id },
      data: { deletedAt: null },
    });

    await prisma.orderLog.create({
      data: {
        orderId: id,
        userId: user.id,
        action: "restored",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to restore order:", error);
    return NextResponse.json(
      { error: "Failed to restore order" },
      { status: 500 },
    );
  }
}
