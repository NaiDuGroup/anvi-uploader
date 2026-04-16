import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";

const TRASH_RETENTION_DAYS = 31;

const STUDIO_CLIENT_SELECT = {
  id: true,
  kind: true,
  phone: true,
  personName: true,
  companyName: true,
  companyIdno: true,
} as const;

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = 25;
    const offset = (page - 1) * limit;

    const [orders, totalCount] = await Promise.all([
      prisma.order.findMany({
        where: { deletedAt: { not: null } },
        include: {
          files: true,
          studioClient: { select: STUDIO_CLIENT_SELECT },
        },
        orderBy: { deletedAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.order.count({ where: { deletedAt: { not: null } } }),
    ]);

    const orderIds = orders.map((o) => o.id);

    const deleteLogs = orderIds.length > 0
      ? await prisma.orderLog.findMany({
          where: { orderId: { in: orderIds }, action: "deleted" },
          orderBy: { createdAt: "desc" },
          distinct: ["orderId"],
          select: { orderId: true, userId: true },
        })
      : [];

    const deleteUserIds = [...new Set(deleteLogs.map((l) => l.userId))];
    const deleteUsers = deleteUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: deleteUserIds } },
          select: { id: true, name: true, displayName: true },
        })
      : [];
    const userNameMap = new Map(deleteUsers.map((u) => [u.id, u.displayName ?? u.name]));
    const deletedByMap = new Map(
      deleteLogs.map((l) => [l.orderId, userNameMap.get(l.userId) ?? null]),
    );

    const now = Date.now();
    const enriched = orders.map((o) => {
      const deletedMs = o.deletedAt!.getTime();
      const daysSinceDeletion = Math.floor((now - deletedMs) / 86_400_000);
      const daysRemaining = Math.max(0, TRASH_RETENTION_DAYS - daysSinceDeletion);
      return { ...o, daysRemaining, deletedByName: deletedByMap.get(o.id) ?? null };
    });

    return NextResponse.json({
      orders: enriched,
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    });
  } catch (error) {
    console.error("Failed to fetch trash orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch trash orders" },
      { status: 500 },
    );
  }
}
