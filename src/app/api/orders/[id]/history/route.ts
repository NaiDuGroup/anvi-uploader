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
            select: {
              id: true,
              name: true,
              displayName: true,
              role: true,
              studioCustomer: { select: { isDealer: true, companyName: true, personName: true } },
            },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Customer-portal users show as «dealer» / «client» with their company / person name.
    const nameOf = (u: (typeof users)[number]) =>
      u.role === "customer"
        ? (u.studioCustomer?.companyName ?? u.studioCustomer?.personName ?? u.displayName ?? u.name)
        : (u.displayName ?? u.name);
    const roleOf = (u: (typeof users)[number]) =>
      u.role === "customer" ? (u.studioCustomer?.isDealer ? "dealer" : "client") : u.role;

    const entries = logs.map((log) => {
      const u = userMap.get(log.userId);
      return {
        id: log.id,
        action: log.action,
        field: log.field,
        oldValue: log.oldValue,
        newValue: log.newValue,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
        userName: u ? nameOf(u) : (log.userId === "client" ? "Client" : "Unknown"),
        userRole: u ? roleOf(u) : (log.userId === "client" ? "client" : "unknown"),
      };
    });

    // Staff-only route (`getSessionUser` refuses customers): no customer ever reads this.
    return NextResponse.json(entries);
  } catch (error) {
    console.error("Failed to fetch order history:", error);
    return NextResponse.json(
      { error: "Failed to fetch order history" },
      { status: 500 },
    );
  }
}
