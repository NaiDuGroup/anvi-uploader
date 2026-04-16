import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      select: { deletedAt: true },
    });
    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const logs = await prisma.orderLog.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const userIds = [...new Set(logs.map((l) => l.userId).filter((uid) => uid !== "client"))];

    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, displayName: true, role: true },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = logs.map((log) => {
      const u = userMap.get(log.userId);
      return {
        id: log.id,
        action: log.action,
        field: log.field,
        oldValue: log.oldValue,
        newValue: log.newValue,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
        userName: u ? (u.displayName ?? u.name) : (log.userId === "client" ? "Client" : "Unknown"),
        userRole: u?.role ?? (log.userId === "client" ? "client" : "unknown"),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch order history:", error);
    return NextResponse.json(
      { error: "Failed to fetch order history" },
      { status: 500 },
    );
  }
}
