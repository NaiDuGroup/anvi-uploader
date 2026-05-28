import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getStaffUsersMap } from "./staffUsersCache";
import { ORDER_STATUSES } from "./validations";
import type { OrderStatus } from "./validations";
import { groupLines } from "./workshopBoard/groupLines";
import type { WorkshopBoardData } from "./workshopBoard/types";
import type { WorkshopBoardFile } from "./workshopBoard/types";

/** Cap the number of orders returned to avoid unbounded queries. */
const MAX_ORDERS = 500;

const BOARD_ACTIVE_STATUSES: OrderStatus[] = [
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
];

const BOARD_EXTENDED_STATUSES: OrderStatus[] = [
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
  "RETURNED_TO_STUDIO",
  "DELIVERED",
];

const ORDER_LINE_SELECT = {
  id: true,
  sortOrder: true,
  productType: true,
  mugProductId: true,
  mugProductSnapshot: true,
  notebookProductId: true,
  notebookProductSnapshot: true,
  largeFormatMaterialId: true,
  largeFormatLineData: true,
} as const satisfies Prisma.OrderLineSelect;

const ORDER_FILE_SELECT = {
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

export interface WorkshopBoardUser {
  id: string;
  name: string;
  role: string;
}

export interface WorkshopBoardParams {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Include RETURNED_TO_STUDIO and DELIVERED in addition to the 3 active statuses. */
  includeDelivered?: boolean;
}

export async function fetchWorkshopBoardData(
  user: WorkshopBoardUser,
  params: WorkshopBoardParams = {},
): Promise<WorkshopBoardData> {
  const search = params.search?.trim() ?? "";
  const dateFrom = params.dateFrom?.trim() ?? "";
  const dateTo = params.dateTo?.trim() ?? "";
  const includeDelivered = params.includeDelivered ?? false;

  const validStatuses = new Set<string>(ORDER_STATUSES as readonly string[]);
  const statusList = (includeDelivered ? BOARD_EXTENDED_STATUSES : BOARD_ACTIVE_STATUSES).filter(
    (s) => validStatuses.has(s),
  ) as OrderStatus[];

  const searchIsNumeric = /^\d+$/.test(search);
  const searchFilter = search
    ? searchIsNumeric
      ? Prisma.sql`AND (phone LIKE ${"%" + search + "%"} OR order_number = ${parseInt(search, 10)})`
      : Prisma.sql`AND phone LIKE ${"%" + search + "%"}`
    : Prisma.sql``;

  const dateFromFilter = dateFrom
    ? Prisma.sql`AND created_at >= ${new Date(dateFrom + "T00:00:00")}`
    : Prisma.sql``;
  const dateToFilter = dateTo
    ? Prisma.sql`AND created_at < ${new Date(new Date(dateTo + "T00:00:00").getTime() + 86_400_000)}`
    : Prisma.sql``;

  // Workshop role: sees all workshop orders (no `onlyMine` filter on board).
  // Admin/superadmin: same scope — the board is a production view, not a personal queue.
  const workshopFilter =
    user.role === "workshop"
      ? Prisma.sql`AND is_workshop = true`
      : Prisma.sql`AND is_workshop = true`;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH board_orders AS (
      SELECT id, is_prio, created_at
      FROM orders
      WHERE deleted_at IS NULL
        ${workshopFilter}
        AND status = ANY(${statusList})
        ${searchFilter}
        ${dateFromFilter}
        ${dateToFilter}
      LIMIT ${MAX_ORDERS}
    ),
    unread_orders AS (
      SELECT DISTINCT c.order_id
      FROM comments c
      JOIN board_orders bo ON bo.id = c.order_id
      LEFT JOIN comment_reads cr
        ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
      WHERE cr.read_at IS NULL OR c.created_at > cr.read_at
    )
    SELECT bo.id
    FROM board_orders bo
    LEFT JOIN unread_orders u ON u.order_id = bo.id
    ORDER BY bo.is_prio DESC,
             (u.order_id IS NOT NULL) DESC,
             bo.created_at DESC
  `;

  const orderIds = rows.map((r) => r.id);
  if (orderIds.length === 0) {
    return { sections: [], fetchedAt: new Date().toISOString() };
  }

  const [orders, commentCounts, unreadRows, usersMap] = await Promise.all([
    prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        orderNumber: true,
        phone: true,
        clientName: true,
        status: true,
        isPrio: true,
        notes: true,
        productType: true,
        mugProductSnapshot: true,
        notebookProductSnapshot: true,
        createdAt: true,
        createdBy: true,
        sentToWorkshopBy: true,
        files: { select: ORDER_FILE_SELECT },
        orderLines: {
          orderBy: { sortOrder: "asc" },
          select: ORDER_LINE_SELECT,
        },
      },
    }),
    prisma.comment.groupBy({
      by: ["orderId"],
      where: { orderId: { in: orderIds } },
      _count: { id: true },
    }),
    prisma.$queryRaw<Array<{ order_id: string; cnt: bigint }>>`
      SELECT c.order_id, COUNT(*)::bigint AS cnt
      FROM comments c
      LEFT JOIN comment_reads cr
        ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
      WHERE c.order_id = ANY(${orderIds})
        AND (cr.read_at IS NULL OR c.created_at > cr.read_at)
      GROUP BY c.order_id
    `,
    getStaffUsersMap(),
  ]);

  const totalMap = new Map(commentCounts.map((c) => [c.orderId, c._count.id]));
  const unreadCounts = new Map(unreadRows.map((r) => [r.order_id, Number(r.cnt)]));
  const idIndex = new Map(orderIds.map((id, i) => [id, i]));
  orders.sort((a, b) => (idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));

  const rawOrders = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    phone: o.phone,
    clientName: o.clientName,
    status: o.status,
    isPrio: o.isPrio,
    unreadCommentCount: unreadCounts.get(o.id) ?? 0,
    commentCount: totalMap.get(o.id) ?? 0,
    createdAt: o.createdAt.toISOString(),
    notes: o.notes,
    productType: o.productType,
    mugProductSnapshot: o.mugProductSnapshot,
    notebookProductSnapshot: o.notebookProductSnapshot,
    createdByName: o.createdBy ? (usersMap.get(o.createdBy) ?? null) : null,
    sentToWorkshopByName: o.sentToWorkshopBy ? (usersMap.get(o.sentToWorkshopBy) ?? null) : null,
    files: o.files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      fileUrl: f.fileUrl,
      copies: f.copies,
      color: f.color,
      paperType: f.paperType,
      pageCount: f.pageCount,
      orderLineId: f.orderLineId,
    } satisfies WorkshopBoardFile)),
    orderLines: o.orderLines.map((line) => ({
      id: line.id,
      sortOrder: line.sortOrder,
      productType: line.productType,
      mugProductId: line.mugProductId,
      mugProductSnapshot: line.mugProductSnapshot,
      notebookProductId: line.notebookProductId,
      notebookProductSnapshot: line.notebookProductSnapshot,
      largeFormatLineData: line.largeFormatLineData,
      files: [], // will be populated in groupLines via order.files filter
    })),
  }));

  const sections = groupLines(rawOrders);

  return { sections, fetchedAt: new Date().toISOString() };
}
