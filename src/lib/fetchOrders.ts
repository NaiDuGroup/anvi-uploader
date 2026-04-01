import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ORDER_STATUSES } from "./validations";
import type { OrderStatus } from "./validations";

interface FetchOrdersUser {
  id: string;
  name: string;
  role: string;
}

interface FetchOrdersParams {
  page?: number;
  limit?: number;
  search?: string;
  onlyMine?: boolean;
  hideDelivered?: boolean;
  statuses?: OrderStatus[];
  dateFrom?: string;
  dateTo?: string;
}

export interface FetchOrdersResult {
  orders: Record<string, unknown>[];
  page: number;
  totalPages: number;
  totalCount: number;
  workshopOrders?: Record<string, unknown>[];
  currentUser: { id: string; name: string; role: string };
}

export async function fetchOrdersData(
  user: FetchOrdersUser,
  params: FetchOrdersParams = {},
): Promise<FetchOrdersResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 30));
  const search = params.search?.trim() ?? "";
  const onlyMine = params.onlyMine ?? false;
  const hideDelivered = params.hideDelivered ?? false;
  const dateFrom = params.dateFrom?.trim() ?? "";
  const dateTo = params.dateTo?.trim() ?? "";
  const offset = (page - 1) * limit;

  const validStatuses = new Set<string>(ORDER_STATUSES as readonly string[]);
  const selectedStatuses: OrderStatus[] = (params.statuses ?? []).filter(
    (s) => validStatuses.has(s),
  ) as OrderStatus[];

  const workshopFilter =
    user.role === "workshop" ? Prisma.sql`AND is_workshop = true` : Prisma.sql``;
  const searchFilter = search
    ? Prisma.sql`AND phone LIKE ${"%" + search + "%"}`
    : Prisma.sql``;
  const onlyMineFilter =
    onlyMine && user.role !== "workshop"
      ? Prisma.sql`AND created_by = ${user.id}`
      : Prisma.sql``;
  const hideDeliveredFilter = hideDelivered
    ? Prisma.sql`AND status != 'DELIVERED'`
    : Prisma.sql``;
  const statusFilter =
    selectedStatuses.length > 0
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
             CASE
               WHEN status = 'NEW' THEN 0
               WHEN status = 'IN_PROGRESS' THEN 0
               WHEN status = 'DELIVERED' THEN 2
               ELSE 1
             END ASC,
             created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const orderedIds = rows.map((r) => r.id);
  const currentUser = { id: user.id, name: user.name, role: user.role };

  if (orderedIds.length === 0) {
    const resp: FetchOrdersResult = {
      orders: [],
      page,
      totalPages: totalCount > 0 ? totalPages : 0,
      totalCount,
      currentUser,
    };
    if (user.role !== "workshop") resp.workshopOrders = [];
    return resp;
  }

  const wsSidebarStatuses = ["SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY"];
  const wsStatusList =
    user.role !== "workshop"
      ? selectedStatuses.length > 0
        ? selectedStatuses.filter((s) => wsSidebarStatuses.includes(s))
        : wsSidebarStatuses
      : [];

  const wsIdsPromise =
    wsStatusList.length > 0
      ? prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM orders
          WHERE is_workshop = true
            AND status = ANY(${wsStatusList})
            ${searchFilter}
            ${onlyMineFilter}
            ${dateFromFilter}
            ${dateToFilter}
          ORDER BY is_prio DESC,
                   created_at DESC
        `
      : Promise.resolve([] as Array<{ id: string }>);

  const [orders, commentCounts, unreadRows, wsRows] = await Promise.all([
    prisma.order.findMany({
      where: { id: { in: orderedIds } },
      include: {
        files: true,
        items: {
          include: {
            files: true,
            category: { select: { id: true, name: true, slug: true } },
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    }),
    prisma.comment.groupBy({
      by: ["orderId"],
      where: { orderId: { in: orderedIds } },
      _count: { id: true },
    }),
    prisma.$queryRaw<Array<{ order_id: string; cnt: bigint }>>`
      SELECT c.order_id, COUNT(*)::bigint AS cnt
      FROM comments c
      LEFT JOIN comment_reads cr
        ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
      WHERE c.order_id = ANY(${orderedIds})
        AND (cr.read_at IS NULL OR c.created_at > cr.read_at)
      GROUP BY c.order_id
    `,
    wsIdsPromise,
  ]);

  const idIndex = new Map(orderedIds.map((id, i) => [id, i]));
  orders.sort((a, b) => (idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));

  const userIds = [
    ...new Set(
      [
        ...orders.map((o) => o.assignedTo).filter(Boolean),
        ...orders.map((o) => o.createdBy).filter(Boolean),
        ...orders.map((o) => o.sentToWorkshopBy).filter(Boolean),
      ] as string[],
    ),
  ];
  const usersMap = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    users.forEach((u) => usersMap.set(u.id, u.name));
  }

  const totalMap = new Map(commentCounts.map((c) => [c.orderId, c._count.id]));
  const unreadCounts = new Map(
    unreadRows.map((r) => [r.order_id, Number(r.cnt)]),
  );

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
    totalPrice: o.totalPrice ?? null,
    items: (o.items ?? []).map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      categoryName: item.category?.name ?? null,
      categorySlug: item.category?.slug ?? null,
      productId: item.productId,
      productName: item.product?.name ?? null,
      productSku: item.product?.sku ?? null,
      customerProvided: item.customerProvided,
      quantity: item.quantity,
      width: item.width ?? null,
      height: item.height ?? null,
      unitPrice: item.unitPrice ?? null,
      totalPrice: item.totalPrice ?? null,
      priceOverride: item.priceOverride,
      attributes: item.attributes as Record<string, unknown> | null,
      notes: item.notes,
      files: item.files,
    })),
  });

  const enriched = orders.map((o) => enrich(o, usersMap, totalMap, unreadCounts));

  let workshopSidebarOrders: typeof enriched | undefined;
  if (user.role !== "workshop") {
    const wsIds = wsRows.map((r) => r.id);
    const wsAlreadyLoaded = new Set(orderedIds);
    const wsExtraIds = wsIds.filter((id) => !wsAlreadyLoaded.has(id));

    let wsExtraOrders: typeof orders = [];
    if (wsExtraIds.length > 0) {
      const [extraOrders, extraComments, extraUnread] = await Promise.all([
        prisma.order.findMany({
          where: { id: { in: wsExtraIds } },
          include: {
            files: true,
            items: {
              include: {
                files: true,
                category: { select: { id: true, name: true, slug: true } },
                product: { select: { id: true, name: true, sku: true } },
              },
            },
          },
        }),
        prisma.comment.groupBy({
          by: ["orderId"],
          where: { orderId: { in: wsExtraIds } },
          _count: { id: true },
        }),
        prisma.$queryRaw<Array<{ order_id: string; cnt: bigint }>>`
          SELECT c.order_id, COUNT(*)::bigint AS cnt
          FROM comments c
          LEFT JOIN comment_reads cr
            ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
          WHERE c.order_id = ANY(${wsExtraIds})
            AND (cr.read_at IS NULL OR c.created_at > cr.read_at)
          GROUP BY c.order_id
        `,
      ]);
      wsExtraOrders = extraOrders;
      extraComments.forEach((c) => totalMap.set(c.orderId, c._count.id));
      extraUnread.forEach((r) => unreadCounts.set(r.order_id, Number(r.cnt)));

      const extraUserIds = [
        ...new Set(
          [
            ...wsExtraOrders.map((o) => o.assignedTo).filter(Boolean),
            ...wsExtraOrders.map((o) => o.createdBy).filter(Boolean),
            ...wsExtraOrders.map((o) => o.sentToWorkshopBy).filter(Boolean),
          ] as string[],
        ),
      ].filter((id) => !usersMap.has(id));
      if (extraUserIds.length > 0) {
        const extraUsers = await prisma.user.findMany({
          where: { id: { in: extraUserIds } },
          select: { id: true, name: true },
        });
        extraUsers.forEach((u) => usersMap.set(u.id, u.name));
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

  return {
    orders: enriched as unknown as Record<string, unknown>[],
    page,
    totalPages,
    totalCount,
    ...(workshopSidebarOrders !== undefined && {
      workshopOrders: workshopSidebarOrders as unknown as Record<string, unknown>[],
    }),
    currentUser,
  };
}
