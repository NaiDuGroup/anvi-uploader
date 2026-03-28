import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientVisibleStatus } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const order = await prisma.order.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (new Date() > order.expiresAt) {
      return NextResponse.json(
        { error: "Order tracking link has expired" },
        { status: 410 }
      );
    }

    return NextResponse.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: getClientVisibleStatus(order.status),
      createdAt: order.createdAt,
    });
  } catch (error) {
    console.error("Failed to track order:", error);
    return NextResponse.json(
      { error: "Failed to track order" },
      { status: 500 }
    );
  }
}
