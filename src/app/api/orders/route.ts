import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrderSchema } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";
import { nanoid } from "nanoid";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const where =
      user.role === "workshop" ? { isWorkshop: true } : undefined;

    const orders = await prisma.order.findMany({
      where,
      include: { files: true },
      orderBy: { createdAt: "desc" },
    });

    // Resolve assigned + creator + workshop sender user names in one query
    const userIds = [
      ...new Set([
        ...orders.map((o) => o.assignedTo).filter(Boolean),
        ...orders.map((o) => o.createdBy).filter(Boolean),
        ...orders.map((o) => o.sentToWorkshopBy).filter(Boolean),
      ] as string[]),
    ];
    const usersMap = new Map<string, string>();
    if (userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      });
      users.forEach((u) => usersMap.set(u.id, u.name));
    }

    const orderIds = orders.map((o) => o.id);

    // Count total + unread comments per order for the current user
    const commentCounts = await prisma.comment.groupBy({
      by: ["orderId"],
      where: { orderId: { in: orderIds } },
      _count: { id: true },
    });
    const totalMap = new Map(commentCounts.map((c) => [c.orderId, c._count.id]));

    const reads = await prisma.commentRead.findMany({
      where: { userId: user.id, orderId: { in: orderIds } },
      select: { orderId: true, readAt: true },
    });
    const readMap = new Map(reads.map((r) => [r.orderId, r.readAt]));

    let unreadCounts: Map<string, number> = new Map();
    const orderIdsWithComments = orderIds.filter((id) => (totalMap.get(id) ?? 0) > 0);
    if (orderIdsWithComments.length > 0) {
      const unreadResults = await Promise.all(
        orderIdsWithComments.map(async (orderId) => {
          const readAt = readMap.get(orderId);
          const count = await prisma.comment.count({
            where: {
              orderId,
              ...(readAt ? { createdAt: { gt: readAt } } : {}),
            },
          });
          return { orderId, count };
        })
      );
      unreadCounts = new Map(unreadResults.map((r) => [r.orderId, r.count]));
    }

    const enriched = orders.map((o) => ({
      ...o,
      assignedToName: o.assignedTo ? usersMap.get(o.assignedTo) ?? null : null,
      createdByName: o.createdBy ? usersMap.get(o.createdBy) ?? null : null,
      sentToWorkshopByName: o.sentToWorkshopBy ? usersMap.get(o.sentToWorkshopBy) ?? null : null,
      commentCount: totalMap.get(o.id) ?? 0,
      unreadCommentCount: unreadCounts.get(o.id) ?? 0,
    }));

    enriched.sort((a, b) => {
      if (a.isPrio !== b.isPrio) return a.isPrio ? -1 : 1;
      const aDelivered = a.status === "DELIVERED" ? 1 : 0;
      const bDelivered = b.status === "DELIVERED" ? 1 : 0;
      if (aDelivered !== bDelivered) return aDelivered - bDelivered;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Failed to fetch orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createOrderSchema.parse(body);

    const order = await prisma.order.create({
      data: {
        phone: validated.phone,
        notes: validated.notes,
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        files: {
          create: validated.files.map((file) => ({
            fileName: file.fileName,
            fileUrl: file.fileUrl,
            copies: file.copies,
            color: file.color,
            paperType: file.paperType,
            pageCount: file.pageCount,
          })),
        },
      },
      include: { files: true },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Failed to create order:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
