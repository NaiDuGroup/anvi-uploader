import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  DEFAULT_ORDER_PAGE_SIZE,
  normalizeOrderPageLimit,
} from "./orderPagination";
import { getStaffUsersMap } from "./staffUsersCache";
import { getProcurementTodayCount } from "./procurementTodayCache";
import { fetchWorkshopSidebarData } from "./fetchWorkshopSidebar";
import { ORDER_STATUSES } from "./validations";
import type { OrderStatus } from "./validations";

/**
 * `select` for the list query — mirrors the Order scalars callers consume
 * MINUS the heavy JSON columns (`mugLayoutData`, `notebookLayoutData`) which
 * can carry base64 preview images and are only needed by the order edit wizard
 * (which loads the full order separately via `/api/admin/orders/[id]`).
 * `mugProductSnapshot` / `notebookProductSnapshot` STAY: they drive per-line
 * product thumbnails. `procurementMeta` STAYS: powers the "needs procurement"
 * tooltip.
 *
 * `invoiceLineItems` is included here so the admin orders list can render
 * the "Cont N" badge in the same RSC payload as the row itself, instead of
 * issuing a separate `/api/orders/invoice-info?ids=…` round-trip after the
 * list renders. We filter `invoice.number IS NOT NULL` so DRAFT invoices
 * stay invisible until they are issued, matching the previous behaviour.
 *
 * `studioClient` previously lived here too — that badge is now driven by
 * the existing `clientId` scalar.
 */
const ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  phone: true,
  status: true,
  assignedTo: true,
  isWorkshop: true,
  isPrio: true,
  price: true,
  isPaid: true,
  notes: true,
  issueReason: true,
  createdBy: true,
  sentToWorkshopBy: true,
  clientName: true,
  clientId: true,
  productType: true,
  mugProductId: true,
  mugProductSnapshot: true,
  notebookProductId: true,
  notebookProductSnapshot: true,
  approvalFeedback: true,
  publicToken: true,
  expiresAt: true,
  createdAt: true,
  deletedAt: true,
  needsProcurement: true,
  procurementMeta: true,
  invoiceLineItems: {
    where: { invoice: { number: { not: null } } },
    select: {
      id: true,
      invoice: { select: { id: true, number: true } },
    },
  },
} as const satisfies Prisma.OrderSelect;

const ORDER_LINE_LIST_SELECT = {
  id: true,
  orderId: true,
  sortOrder: true,
  productType: true,
  mugProductId: true,
  mugProductSnapshot: true,
  notebookProductId: true,
  notebookProductSnapshot: true,
  largeFormatMaterialId: true,
  largeFormatLineData: true,
} as const satisfies Prisma.OrderLineSelect;

const ORDER_FILE_LIST_SELECT = {
  id: true,
  orderId: true,
  orderLineId: true,
  fileUrl: true,
  fileName: true,
  copies: true,
  color: true,
  paperType: true,
  pageCount: true,
} as const satisfies Prisma.FileSelect;

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
  needsProcurementOnly?: boolean;
  statuses?: OrderStatus[];
  dateFrom?: string;
  dateTo?: string;
  includeWorkshop?: boolean;
}

export interface FetchOrdersResult {
  orders: Record<string, unknown>[];
  page: number;
  totalPages: number;
  totalCount: number;
  workshopOrders?: Record<string, unknown>[];
  currentUser: { id: string; name: string; role: string };
  procurementTodayCount?: number;
  /**
   * Per-step millisecond timings for diagnostic Server-Timing headers.
   * Not serialised to the client JSON body — the API route reads it and
   * strips it before responding (see `/api/orders/route.ts`).
   */
  _timings?: Record<string, number>;
}

export async function fetchOrdersData(
  user: FetchOrdersUser,
  params: FetchOrdersParams = {},
): Promise<FetchOrdersResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = normalizeOrderPageLimit(params.limit ?? DEFAULT_ORDER_PAGE_SIZE);
  const search = params.search?.trim() ?? "";
  const onlyMine = params.onlyMine ?? false;
  const hideDelivered = params.hideDelivered ?? false;
  const needsProcurementOnly = params.needsProcurementOnly ?? false;
  const dateFrom = params.dateFrom?.trim() ?? "";
  const dateTo = params.dateTo?.trim() ?? "";
  const offset = (page - 1) * limit;
  const includeWorkshop = params.includeWorkshop ?? true;

  const validStatuses = new Set<string>(ORDER_STATUSES as readonly string[]);
  const selectedStatuses: OrderStatus[] = (params.statuses ?? []).filter(
    (s) => validStatuses.has(s),
  ) as OrderStatus[];

  const workshopFilter =
    user.role === "workshop" ? Prisma.sql`AND is_workshop = true` : Prisma.sql``;
  const searchIsNumeric = /^\d+$/.test(search);
  const searchFilter = search
    ? searchIsNumeric
      ? Prisma.sql`AND (phone LIKE ${"%" + search + "%"} OR order_number = ${parseInt(search, 10)})`
      : Prisma.sql`AND phone LIKE ${"%" + search + "%"}`
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
  const needsProcurementFilter = needsProcurementOnly
    ? Prisma.sql`AND needs_procurement = true`
    : Prisma.sql``;

  const whereSql = Prisma.sql`
    WHERE deleted_at IS NULL
      ${workshopFilter}
      ${searchFilter}
      ${onlyMineFilter}
      ${hideDeliveredFilter}
      ${statusFilter}
      ${dateFromFilter}
      ${dateToFilter}
      ${needsProcurementFilter}
  `;

  const timings: Record<string, number> = {};
  const measure = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await run();
    } finally {
      timings[label] = Math.max(timings[label] ?? 0, Date.now() - startedAt);
    }
  };

  const pageRows = await measure("countAndListIds", () =>
    prisma.$queryRaw<Array<{ id: string | null; total_count: bigint }>>`
      WITH filtered_orders AS (
        SELECT id, is_prio, status, created_at
        FROM orders
        ${whereSql}
      ),
      total AS (
        SELECT COUNT(*)::bigint AS total_count FROM filtered_orders
      ),
      unread_orders AS (
        SELECT DISTINCT c.order_id
        FROM comments c
        JOIN filtered_orders fo ON fo.id = c.order_id
        LEFT JOIN comment_reads cr
          ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
        WHERE cr.read_at IS NULL OR c.created_at > cr.read_at
      ),
      page_ids AS (
        SELECT fo.id
        FROM filtered_orders fo
        LEFT JOIN unread_orders u ON u.order_id = fo.id
        ORDER BY fo.is_prio DESC,
                 (u.order_id IS NOT NULL) DESC,
                 CASE
                   WHEN fo.status = 'NEW' THEN 0
                   WHEN fo.status = 'IN_PROGRESS' THEN 0
                   WHEN fo.status = 'DELIVERED' THEN 2
                   ELSE 1
                 END ASC,
                 fo.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      )
      SELECT page_ids.id, total.total_count
      FROM total
      LEFT JOIN page_ids ON true
    `,
  );

  const totalCount =
    pageRows.length > 0 ? Number(pageRows[0]!.total_count ?? BigInt(0)) : 0;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 0;
  const orderedIds = pageRows
    .map((r) => r.id)
    .filter((id): id is string => id !== null);
  const currentUser = { id: user.id, name: user.name, role: user.role };

  if (orderedIds.length === 0) {
    const resp: FetchOrdersResult = {
      orders: [],
      page,
      totalPages: totalCount > 0 ? totalPages : 0,
      totalCount,
      currentUser,
      _timings: timings,
    };
    if (user.role !== "workshop") resp.workshopOrders = [];
    return resp;
  }

  const wantWorkshopSidebar = user.role !== "workshop" && includeWorkshop;

  const batchStartedAt = Date.now();
  const [
    orders,
    commentCounts,
    unreadRows,
    clientMessageCounts,
    unreadClientMessageRows,
    procurementTodayCount,
    sidebarResult,
  ] =
    await Promise.all([
      measure("ordersFindMany", () =>
        prisma.order.findMany({
          where: { id: { in: orderedIds } },
          select: {
            ...ORDER_LIST_SELECT,
            files: { select: ORDER_FILE_LIST_SELECT },
            orderLines: {
              orderBy: { sortOrder: "asc" },
              select: ORDER_LINE_LIST_SELECT,
            },
          },
        }),
      ),
      measure("commentCounts", () =>
        prisma.comment.groupBy({
          by: ["orderId"],
          where: { orderId: { in: orderedIds } },
          _count: { id: true },
        }),
      ),
      measure(
        "unreadCounts",
        () =>
          prisma.$queryRaw<Array<{ order_id: string; cnt: bigint }>>`
            SELECT c.order_id, COUNT(*)::bigint AS cnt
            FROM comments c
            LEFT JOIN comment_reads cr
              ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
            WHERE c.order_id = ANY(${orderedIds})
              AND (cr.read_at IS NULL OR c.created_at > cr.read_at)
            GROUP BY c.order_id
          `,
      ),
      measure("clientMessageCounts", () =>
        prisma.clientMessage.groupBy({
          by: ["orderId"],
          where: { orderId: { in: orderedIds } },
          _count: { id: true },
        }),
      ),
      measure(
        "unreadClientMessageCounts",
        () =>
          // Unread for staff = client (role = customer) messages newer than this
          // staff user's read watermark, so the sound fires on client replies.
          prisma.$queryRaw<Array<{ order_id: string; cnt: bigint }>>`
            SELECT m.order_id, COUNT(*)::bigint AS cnt
            FROM client_messages m
            JOIN users u ON u.id = m.user_id
            LEFT JOIN client_message_reads r
              ON r.order_id = m.order_id AND r.user_id = ${user.id}
            WHERE m.order_id = ANY(${orderedIds})
              AND u.role = 'customer'
              AND (r.read_at IS NULL OR m.created_at > r.read_at)
            GROUP BY m.order_id
          `,
      ),
      measure("procurementToday", () => getProcurementTodayCount(user.role)),
      wantWorkshopSidebar
        ? measure("workshopSidebar", () =>
            fetchWorkshopSidebarData(user, {
              search,
              onlyMine,
              needsProcurementOnly,
              statuses: selectedStatuses,
              dateFrom,
              dateTo,
            }),
          )
        : Promise.resolve(null as { workshopOrders: Record<string, unknown>[] } | null),
    ]);
  timings.batchTotal = Date.now() - batchStartedAt;

  const idIndex = new Map(orderedIds.map((id, i) => [id, i]));
  orders.sort((a, b) => (idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));

  const usersMap = await measure("staffUsersMap", () => getStaffUsersMap());

  // `getStaffUsersMap()` intentionally excludes customer-portal users, so orders
  // created/sent by a logged-in cabinet customer have no name in `usersMap`.
  // Resolve those actor ids with a small page-scoped lookup so the admin sees
  // the actual customer name instead of a generic "Client" fallback.
  const missingActorIds = new Set<string>();
  for (const o of orders) {
    for (const id of [o.createdBy, o.sentToWorkshopBy, o.assignedTo]) {
      if (id && !usersMap.has(id)) missingActorIds.add(id);
    }
  }
  const customerActorMap = new Map<string, string>();
  if (missingActorIds.size > 0) {
    const rows = await measure("customerActorNames", () =>
      prisma.user.findMany({
        where: { id: { in: [...missingActorIds] } },
        select: { id: true, name: true, displayName: true },
      }),
    );
    for (const u of rows) {
      customerActorMap.set(u.id, u.displayName ?? u.name);
    }
  }
  const resolveActorName = (id: string | null | undefined): string | null =>
    id ? usersMap.get(id) ?? customerActorMap.get(id) ?? null : null;

  const totalMap = new Map(commentCounts.map((c) => [c.orderId, c._count.id]));
  const unreadCounts = new Map(
    unreadRows.map((r) => [r.order_id, Number(r.cnt)]),
  );
  const clientMessageTotalMap = new Map(
    clientMessageCounts.map((c) => [c.orderId, c._count.id]),
  );
  const unreadClientMessageCounts = new Map(
    unreadClientMessageRows.map((r) => [r.order_id, Number(r.cnt)]),
  );

  const enriched = orders.map((o) => {
    // Reshape into `invoiceLinks` so the public API contract matches what
    // the now-removed /api/orders/invoice-info endpoint used to return.
    // The raw `invoiceLineItems` relation field is dropped from the payload.
    const { invoiceLineItems, price, ...rest } = o;
    return {
      ...rest,
      // `Order.price` is `Decimal(12, 2)?` on the DB; serialise to a plain
      // JS number so existing list/badge code (`order.price | number | null`)
      // keeps working without a Decimal import on the client.
      price: price == null ? null : Number(price.toString()),
      assignedToName: resolveActorName(o.assignedTo),
      createdByName: resolveActorName(o.createdBy),
      sentToWorkshopByName: resolveActorName(o.sentToWorkshopBy),
      commentCount: totalMap.get(o.id) ?? 0,
      unreadCommentCount: unreadCounts.get(o.id) ?? 0,
      clientMessageCount: clientMessageTotalMap.get(o.id) ?? 0,
      unreadClientMessageCount: unreadClientMessageCounts.get(o.id) ?? 0,
      comments: [],
      invoiceLinks: invoiceLineItems.map((li) => ({
        id: li.id,
        invoice: { id: li.invoice.id, number: li.invoice.number },
      })),
    };
  });

  return {
    orders: enriched as unknown as Record<string, unknown>[],
    page,
    totalPages,
    totalCount,
    procurementTodayCount,
    ...(wantWorkshopSidebar && sidebarResult !== null && {
      workshopOrders: sidebarResult.workshopOrders,
    }),
    currentUser,
    _timings: timings,
  };
}
