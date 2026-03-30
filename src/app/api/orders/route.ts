import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createOrderSchema, ORDER_STATUSES } from "@/lib/validations";
import type { OrderStatus } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";
import { nanoid } from "nanoid";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30", 10) || 30));
    const search = searchParams.get("search")?.trim() ?? "";
    const onlyMine = searchParams.get("onlyMine") === "true";
    const hideDelivered = searchParams.get("hideDelivered") === "true";
    const statusesParam = searchParams.get("statuses")?.trim() ?? "";
    const dateFrom = searchParams.get("dateFrom")?.trim() ?? "";
    const dateTo = searchParams.get("dateTo")?.trim() ?? "";
    const offset = (page - 1) * limit;

    const validStatuses = new Set<string>(ORDER_STATUSES as readonly string[]);
    const selectedStatuses: OrderStatus[] = statusesParam
      ? statusesParam.split(",").filter((s) => validStatuses.has(s)) as OrderStatus[]
      : [];

    const workshopFilter = user.role === "workshop"
      ? Prisma.sql`AND is_workshop = true`
      : Prisma.sql``;
    const searchFilter = search
      ? Prisma.sql`AND phone LIKE ${"%" + search + "%"}`
      : Prisma.sql``;
    const onlyMineFilter = onlyMine && user.role !== "workshop"
      ? Prisma.sql`AND created_by = ${user.id}`
      : Prisma.sql``;
    const hideDeliveredFilter = hideDelivered
      ? Prisma.sql`AND status != 'DELIVERED'`
      : Prisma.sql``;
    const statusFilter = selectedStatuses.length > 0
      ? Prisma.sql`AND status = ANY(${selectedStatuses})`
      : Prisma.sql``;
    const dateFromFilter = dateFrom
      ? Prisma.sql`AND created_at >= ${new Date(dateFrom + "T00:00:00")}`
      : Prisma.sql``;
    const dateToFilter = dateTo
      ? Prisma.sql`AND created_at < ${new Date(new Date(dateTo + "T00:00:00").getTime() + 86_400_000)}`
      : Prisma.sql``;

    const rows = await prisma.$queryRaw<Array<{ id: string; total_count: bigint }>>`
      SELECT id, COUNT(*) OVER() AS total_count
      FROM orders
      WHERE 1=1
        ${workshopFilter}
        ${searchFilter}
        ${onlyMineFilter}
        ${hideDeliveredFilter}
        ${statusFilter}
        ${dateFromFilter}
        ${dateToFilter}
      ORDER BY is_prio DESC,
               CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END ASC,
               created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const orderedIds = rows.map((r) => r.id);

    if (orderedIds.length === 0) {
      const resp: Record<string, unknown> = {
        orders: [],
        page,
        totalPages: totalCount > 0 ? totalPages : 0,
        totalCount,
      };
      if (user.role !== "workshop") resp.workshopOrders = [];
      return NextResponse.json(resp);
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: orderedIds } },
      include: { files: true },
    });

    const idIndex = new Map(orderedIds.map((id, i) => [id, i]));
    orders.sort((a, b) => (idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));

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

    const commentCounts = await prisma.comment.groupBy({
      by: ["orderId"],
      where: { orderId: { in: orderIds } },
      _count: { id: true },
    });
    const totalMap = new Map(commentCounts.map((c) => [c.orderId, c._count.id]));

    let unreadCounts: Map<string, number> = new Map();
    const orderIdsWithComments = orderIds.filter((id) => (totalMap.get(id) ?? 0) > 0);
    if (orderIdsWithComments.length > 0) {
      const unreadRows = await prisma.$queryRaw<
        Array<{ order_id: string; cnt: bigint }>
      >`
        SELECT c.order_id, COUNT(*)::bigint AS cnt
        FROM comments c
        LEFT JOIN comment_reads cr
          ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
        WHERE c.order_id = ANY(${orderIdsWithComments})
          AND (cr.read_at IS NULL OR c.created_at > cr.read_at)
        GROUP BY c.order_id
      `;
      unreadCounts = new Map(
        unreadRows.map((r) => [r.order_id, Number(r.cnt)]),
      );
    }

    const enrich = (
      o: (typeof orders)[number],
      uMap: Map<string, string>,
      tMap: Map<string, number>,
      urMap: Map<string, number>,
    ) => ({
      ...o,
      assignedToName: o.assignedTo ? uMap.get(o.assignedTo) ?? null : null,
      createdByName: o.createdBy ? uMap.get(o.createdBy) ?? null : null,
      sentToWorkshopByName: o.sentToWorkshopBy ? uMap.get(o.sentToWorkshopBy) ?? null : null,
      commentCount: tMap.get(o.id) ?? 0,
      unreadCommentCount: urMap.get(o.id) ?? 0,
    });

    const enriched = orders.map((o) =>
      enrich(o, usersMap, totalMap, unreadCounts),
    );

    let workshopSidebarOrders: typeof enriched | undefined;
    if (user.role !== "workshop") {
      const wsSidebarStatuses = ["SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY"];
      const wsStatusList = selectedStatuses.length > 0
        ? selectedStatuses.filter((s) => wsSidebarStatuses.includes(s))
        : wsSidebarStatuses;

      const wsRows = wsStatusList.length === 0
        ? []
        : await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM orders
          WHERE is_workshop = true
            AND status = ANY(${wsStatusList})
            ${searchFilter}
            ${onlyMineFilter}
            ${dateFromFilter}
            ${dateToFilter}
          ORDER BY is_prio DESC,
                   created_at DESC
        `;
      const wsIds = wsRows.map((r) => r.id);
      const wsAlreadyLoaded = new Set(orderedIds);
      const wsExtraIds = wsIds.filter((id) => !wsAlreadyLoaded.has(id));

      let wsExtraOrders: typeof orders = [];
      if (wsExtraIds.length > 0) {
        wsExtraOrders = await prisma.order.findMany({
          where: { id: { in: wsExtraIds } },
          include: { files: true },
        });

        const extraUserIds = [
          ...new Set([
            ...wsExtraOrders.map((o) => o.assignedTo).filter(Boolean),
            ...wsExtraOrders.map((o) => o.createdBy).filter(Boolean),
            ...wsExtraOrders.map((o) => o.sentToWorkshopBy).filter(Boolean),
          ] as string[]),
        ].filter((id) => !usersMap.has(id));
        if (extraUserIds.length > 0) {
          const extraUsers = await prisma.user.findMany({
            where: { id: { in: extraUserIds } },
            select: { id: true, name: true },
          });
          extraUsers.forEach((u) => usersMap.set(u.id, u.name));
        }

        const extraOrderIds = wsExtraOrders.map((o) => o.id);
        const extraComments = await prisma.comment.groupBy({
          by: ["orderId"],
          where: { orderId: { in: extraOrderIds } },
          _count: { id: true },
        });
        extraComments.forEach((c) => totalMap.set(c.orderId, c._count.id));

        const extraWithComments = extraOrderIds.filter((id) => (totalMap.get(id) ?? 0) > 0);
        if (extraWithComments.length > 0) {
          const extraUnread = await prisma.$queryRaw<
            Array<{ order_id: string; cnt: bigint }>
          >`
            SELECT c.order_id, COUNT(*)::bigint AS cnt
            FROM comments c
            LEFT JOIN comment_reads cr
              ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
            WHERE c.order_id = ANY(${extraWithComments})
              AND (cr.read_at IS NULL OR c.created_at > cr.read_at)
            GROUP BY c.order_id
          `;
          extraUnread.forEach((r) => unreadCounts.set(r.order_id, Number(r.cnt)));
        }
      }

      const wsIdSet = new Set(wsIds);
      const allWsOrders = [
        ...enriched.filter((o) => wsIdSet.has(o.id)),
        ...wsExtraOrders.map((o) => enrich(o, usersMap, totalMap, unreadCounts)),
      ];
      const wsIdOrder = new Map(wsIds.map((id, i) => [id, i]));
      allWsOrders.sort((a, b) => (wsIdOrder.get(a.id) ?? 0) - (wsIdOrder.get(b.id) ?? 0));
      workshopSidebarOrders = allWsOrders;
    }

    return NextResponse.json({
      orders: enriched,
      page,
      totalPages,
      totalCount,
      ...(workshopSidebarOrders !== undefined && { workshopOrders: workshopSidebarOrders }),
    });
  } catch (error) {
    console.error("Failed to fetch orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 },
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
