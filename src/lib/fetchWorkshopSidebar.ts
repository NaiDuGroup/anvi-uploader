import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getStaffUsersMap } from "./staffUsersCache";
import { ORDER_STATUSES } from "./validations";
import type { OrderStatus } from "./validations";

/**
 * Workshop sidebar feed.
 *
 * Originally built into `fetchOrdersData` and shipped on every `/api/orders`
 * response. That coupled the (frequent) main list polling cadence to the
 * (much less time-sensitive) sidebar refresh. The sidebar query is the most
 * expensive part of the orders waterfall — it adds a CTE round-trip to compute
 * IDs and, when those IDs are not already in the current page, a second
 * `findMany` plus comment / unread queries.
 *
 * This module isolates that logic so `/api/orders/workshop-sidebar` can be
 * polled on its own cadence (e.g. 30 s instead of the 10 s used for the main
 * list), while `fetchOrdersData` invokes the same helper to keep the legacy
 * `/api/orders?includeWorkshop=true` behaviour intact for integration tests.
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
  // Mirror the main /api/orders include so the workshop sidebar can also
  // render the "Cont N" badge without a separate /api/orders/invoice-info
  // round-trip. Filter to issued invoices only (DRAFTs have null `number`).
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

const WORKSHOP_SIDEBAR_STATUSES: OrderStatus[] = [
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
];

export interface WorkshopSidebarUser {
  id: string;
  name: string;
  role: string;
}

export interface WorkshopSidebarParams {
  search?: string;
  onlyMine?: boolean;
  needsProcurementOnly?: boolean;
  statuses?: OrderStatus[];
  dateFrom?: string;
  dateTo?: string;
}

export interface WorkshopSidebarResult {
  workshopOrders: Record<string, unknown>[];
}

export async function fetchWorkshopSidebarData(
  user: WorkshopSidebarUser,
  params: WorkshopSidebarParams = {},
): Promise<WorkshopSidebarResult> {
  const search = params.search?.trim() ?? "";
  const onlyMine = params.onlyMine ?? false;
  const needsProcurementOnly = params.needsProcurementOnly ?? false;
  const dateFrom = params.dateFrom?.trim() ?? "";
  const dateTo = params.dateTo?.trim() ?? "";

  const validStatuses = new Set<string>(ORDER_STATUSES as readonly string[]);
  const selectedStatuses: OrderStatus[] = (params.statuses ?? []).filter(
    (s) => validStatuses.has(s),
  ) as OrderStatus[];
  const wsStatusList =
    selectedStatuses.length > 0
      ? selectedStatuses.filter((s) =>
          (WORKSHOP_SIDEBAR_STATUSES as string[]).includes(s),
        )
      : WORKSHOP_SIDEBAR_STATUSES;

  if (wsStatusList.length === 0) {
    return { workshopOrders: [] };
  }

  const searchIsNumeric = /^\d+$/.test(search);
  const searchFilter = search
    ? searchIsNumeric
      ? Prisma.sql`AND (phone LIKE ${"%" + search + "%"} OR order_number = ${parseInt(search, 10)})`
      : Prisma.sql`AND phone LIKE ${"%" + search + "%"}`
    : Prisma.sql``;
  const onlyMineFilter = onlyMine
    ? Prisma.sql`AND created_by = ${user.id}`
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

  const wsRows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH ws_orders AS (
      SELECT id, is_prio, created_at
      FROM orders
      WHERE deleted_at IS NULL
        AND is_workshop = true
        AND status = ANY(${wsStatusList})
        ${searchFilter}
        ${onlyMineFilter}
        ${dateFromFilter}
        ${dateToFilter}
        ${needsProcurementFilter}
    ),
    unread_orders AS (
      SELECT DISTINCT c.order_id
      FROM comments c
      JOIN ws_orders wo ON wo.id = c.order_id
      LEFT JOIN comment_reads cr
        ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
      WHERE cr.read_at IS NULL OR c.created_at > cr.read_at
    )
    SELECT wo.id
    FROM ws_orders wo
    LEFT JOIN unread_orders u ON u.order_id = wo.id
    ORDER BY wo.is_prio DESC,
             (u.order_id IS NOT NULL) DESC,
             wo.created_at DESC
  `;

  const wsIds = wsRows.map((r) => r.id);
  if (wsIds.length === 0) {
    return { workshopOrders: [] };
  }

  const [orders, commentCounts, unreadRows, usersMap] = await Promise.all([
    prisma.order.findMany({
      where: { id: { in: wsIds } },
      select: {
        ...ORDER_LIST_SELECT,
        files: { select: ORDER_FILE_LIST_SELECT },
        orderLines: {
          orderBy: { sortOrder: "asc" },
          select: ORDER_LINE_LIST_SELECT,
        },
      },
    }),
    prisma.comment.groupBy({
      by: ["orderId"],
      where: { orderId: { in: wsIds } },
      _count: { id: true },
    }),
    prisma.$queryRaw<Array<{ order_id: string; cnt: bigint }>>`
      SELECT c.order_id, COUNT(*)::bigint AS cnt
      FROM comments c
      LEFT JOIN comment_reads cr
        ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
      WHERE c.order_id = ANY(${wsIds})
        AND (cr.read_at IS NULL OR c.created_at > cr.read_at)
      GROUP BY c.order_id
    `,
    getStaffUsersMap(),
  ]);

  const totalMap = new Map(commentCounts.map((c) => [c.orderId, c._count.id]));
  const unreadCounts = new Map(
    unreadRows.map((r) => [r.order_id, Number(r.cnt)]),
  );
  const idIndex = new Map(wsIds.map((id, i) => [id, i]));
  orders.sort((a, b) => (idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));

  const enriched = orders.map((o) => {
    // Same `invoiceLinks` reshape as in `fetchOrdersData` so the public
    // payload contract is identical for the main list and the sidebar.
    const { invoiceLineItems, price, ...rest } = o;
    return {
      ...rest,
      // Mirror `fetchOrdersData`: serialise `Order.price` (Prisma.Decimal)
      // as a plain number for the client list payload.
      price: price == null ? null : Number(price.toString()),
      assignedToName: o.assignedTo ? usersMap.get(o.assignedTo) ?? null : null,
      createdByName: o.createdBy ? usersMap.get(o.createdBy) ?? null : null,
      sentToWorkshopByName: o.sentToWorkshopBy
        ? usersMap.get(o.sentToWorkshopBy) ?? null
        : null,
      commentCount: totalMap.get(o.id) ?? 0,
      unreadCommentCount: unreadCounts.get(o.id) ?? 0,
      comments: [],
      invoiceLinks: invoiceLineItems.map((li) => ({
        id: li.id,
        invoice: { id: li.invoice.id, number: li.invoice.number },
      })),
    };
  });

  return { workshopOrders: enriched as unknown as Record<string, unknown>[] };
}
