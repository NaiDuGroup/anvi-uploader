import { prisma } from "@/lib/prisma";
import { adminDealerUrgencyView } from "@/lib/dealerUrgency";
import { fillDtfGarmentNames } from "@/lib/dtf/dtfGarmentNames";
import { loadDtfSettings } from "@/lib/dtf/resolveDtfLine";
import { giftSetBoardFlags, giftSetBoardSkus, procurementVariantIds } from "@/lib/giftSet/giftSetBoard";
import { loadLfSheetSpecs } from "@/lib/largeFormat/lfSheetSpecs";
import { lineStatusForOrderStatus } from "@/lib/orderLineProductionStatus";
import type { HistoryEntry } from "@/lib/orderHistoryFormat";
import { serializeOrderPrice } from "@/lib/orderPriceDecimal";
import { buildActorNameResolver } from "@/lib/resolveActorNames";
import { getStaffUsersMap } from "@/lib/staffUsersCache";
import { ORDER_FILE_SELECT, ORDER_LINE_SELECT } from "@/lib/fetchWorkshopBoardData";
import { groupLines, type RawOrder } from "./groupLines";
import {
  canEditOrderFromOverview,
  canSeeOrderMoney,
  canViewOrderInOverview,
  historyForRole,
} from "./orderOverviewAccess";
import type { WorkshopOrderOverview, WorkshopOrderOverviewLine } from "./orderOverviewTypes";
import type { WorkshopBoardFile, WorkshopBoardLine } from "./types";

/** Compact history in the panel: the newest entries only. */
export const OVERVIEW_HISTORY_LIMIT = 12;

export interface OverviewUser {
  id: string;
  role: string;
}

/**
 * One order for the board's «Весь заказ» panel: every line described the way
 * the board describes it (same `groupLines` facts), plus header, notes and a
 * compact history. Null when the order is missing, deleted or outside the
 * user's scope (workshop → workshop orders only).
 */
export async function fetchOrderOverview(
  orderId: string,
  user: OverviewUser,
): Promise<WorkshopOrderOverview | null> {
  const o = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      phone: true,
      clientName: true,
      status: true,
      isPrio: true,
      isWorkshop: true,
      source: true,
      price: true,
      isPaid: true,
      issueReason: true,
      dealerEditedAt: true,
      urgencyFee: true,
      urgencyByDealerAt: true,
      urgencyFeeWaivedAt: true,
      notes: true,
      productType: true,
      mugProductSnapshot: true,
      notebookProductSnapshot: true,
      penProductSnapshot: true,
      createdAt: true,
      createdBy: true,
      sentToWorkshopBy: true,
      needsProcurement: true,
      procurementMeta: true,
      files: { select: ORDER_FILE_SELECT },
      orderLines: { orderBy: { sortOrder: "asc" }, select: ORDER_LINE_SELECT },
    },
  });
  if (!o || !canViewOrderInOverview(user.role, o)) return null;

  const [commentCount, unreadCount, usersMap, dtfSettings, logs] = await Promise.all([
    prisma.comment.count({ where: { orderId: o.id } }),
    prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(*)::bigint AS cnt
      FROM comments c
      LEFT JOIN comment_reads cr ON cr.order_id = c.order_id AND cr.user_id = ${user.id}
      WHERE c.order_id = ${o.id} AND (cr.read_at IS NULL OR c.created_at > cr.read_at)
    `,
    getStaffUsersMap(),
    loadDtfSettings(),
    prisma.orderLog.findMany({
      where: { orderId: o.id },
      orderBy: { createdAt: "desc" },
      // Money entries are dropped for the workshop: read a few more first.
      take: OVERVIEW_HISTORY_LIMIT * 3,
    }),
  ]);

  await fillDtfGarmentNames(o.orderLines);

  const setSkus = giftSetBoardSkus(o.orderLines);
  const setSkuVariants = setSkus.length
    ? await prisma.stockVariant.findMany({ where: { sku: { in: setSkus } }, select: { id: true, sku: true } })
    : [];
  const setFlags = o.orderLines.some((l) => l.setGroupId)
    ? giftSetBoardFlags(
        o.orderLines,
        procurementVariantIds(o.needsProcurement, o.procurementMeta),
        new Map(setSkuVariants.map((v) => [v.sku, v.id])),
      )
    : new Map();
  const lfSheetSpecs = await loadLfSheetSpecs(prisma, o.orderLines.map((l) => l.largeFormatMaterialId));

  const logUserIds = logs.map((l) => l.userId).filter((id) => id !== "client");
  const actorName = await buildActorNameResolver(usersMap, [o.createdBy, o.sentToWorkshopBy, ...logUserIds]);
  const logUsers = logUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: [...new Set(logUserIds)] } }, select: { id: true, role: true, studioCustomer: { select: { isDealer: true } } } })
    : [];
  const roleById = new Map(
    logUsers.map((u) => [u.id, u.role === "customer" ? (u.studioCustomer?.isDealer ? "dealer" : "client") : u.role]),
  );

  const files: WorkshopBoardFile[] = o.files.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    fileUrl: f.fileUrl,
    copies: f.copies,
    color: f.color,
    paperType: f.paperType,
    pageCount: f.pageCount,
    orderLineId: f.orderLineId,
  }));

  const raw: RawOrder = {
    id: o.id,
    orderNumber: o.orderNumber,
    phone: o.phone,
    clientName: o.clientName,
    status: o.status,
    isPrio: o.isPrio,
    dealerEditedAt: o.dealerEditedAt?.toISOString() ?? null,
    dealerUrgency: adminDealerUrgencyView(o),
    unreadCommentCount: Number(unreadCount[0]?.cnt ?? 0),
    commentCount,
    createdAt: o.createdAt.toISOString(),
    notes: o.notes,
    productType: o.productType,
    mugProductSnapshot: o.mugProductSnapshot,
    notebookProductSnapshot: o.notebookProductSnapshot,
    penProductSnapshot: o.penProductSnapshot,
    createdByName: actorName(o.createdBy),
    sentToWorkshopByName: actorName(o.sentToWorkshopBy),
    files,
    orderLines: o.orderLines.map((line) => ({
      id: line.id,
      sortOrder: line.sortOrder,
      productType: line.productType,
      mugProductSnapshot: line.mugProductSnapshot,
      notebookProductSnapshot: line.notebookProductSnapshot,
      stockVariantId: line.stockVariantId,
      penProductSnapshot: line.penProductSnapshot,
      largeFormatLineData: line.largeFormatLineData,
      lfSheetSpec: line.largeFormatMaterialId ? (lfSheetSpecs.get(line.largeFormatMaterialId) ?? null) : null,
      businessCardLineData: line.businessCardLineData,
      dtfLineData: line.dtfLineData,
      uvLineData: line.uvLineData,
      sublimationLineData: line.sublimationLineData,
      shopLineData: line.shopLineData,
      setData: line.setData,
      giftSetFlags: setFlags.get(line.id) ?? null,
      productionStatus: line.productionStatus,
      layoutIssueReason: line.layoutIssueReason,
      layoutIssueNote: line.layoutIssueNote,
      layoutIssueAt: line.layoutIssueAt?.toISOString() ?? null,
      layoutFixedAt: line.layoutFixedAt?.toISOString() ?? null,
      ownerReplacedAt: line.ownerReplacedAt?.toISOString() ?? null,
      ownerReplacedRole: line.ownerReplacedRole ?? null,
      files: [],
    })),
  };

  const sections = groupLines([raw], {
    dtfFilm: {
      printableWidthCm: dtfSettings.printableWidthCm,
      gapCm: dtfSettings.gapCm,
      layoutGapMm: dtfSettings.layoutGapMm,
    },
  });
  const boardById = new Map<string, WorkshopBoardLine>();
  for (const s of sections) for (const g of s.groups) for (const l of g.lines) boardById.set(l.orderLineId, l);

  const lines: WorkshopOrderOverviewLine[] =
    o.orderLines.length > 0
      ? o.orderLines.map((line, idx) => ({
          orderLineId: line.id,
          lineIndex: idx + 1,
          totalLines: o.orderLines.length,
          productType: line.productType,
          lineStatus: line.productionStatus ?? lineStatusForOrderStatus(o.status),
          board: boardById.get(line.id) ?? null,
          files: files.filter((f) => f.orderLineId === line.id),
        }))
      : [
          {
            orderLineId: "legacy",
            lineIndex: 1,
            totalLines: 1,
            productType: o.productType,
            lineStatus: lineStatusForOrderStatus(o.status),
            board: boardById.get("legacy") ?? null,
            files,
          },
        ];

  const history: HistoryEntry[] = logs.map((log) => ({
    id: log.id,
    action: log.action,
    field: log.field,
    oldValue: log.oldValue,
    newValue: log.newValue,
    metadata: (log.metadata as Record<string, unknown> | null) ?? null,
    createdAt: log.createdAt.toISOString(),
    userName: log.userId === "client" ? "Client" : (actorName(log.userId) ?? "Unknown"),
    userRole: log.userId === "client" ? "client" : (roleById.get(log.userId) ?? "unknown"),
  }));

  return {
    order: {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      isPrio: o.isPrio,
      phone: o.phone,
      clientName: o.clientName,
      createdAt: o.createdAt.toISOString(),
      notes: o.notes,
      source: o.source,
      createdByName: raw.createdByName,
      sentToWorkshopByName: raw.sentToWorkshopByName,
      dealerUrgency: raw.dealerUrgency ?? null,
      dealerEditedAt: raw.dealerEditedAt ?? null,
      issueReason: o.issueReason,
      commentCount,
      canEdit: canEditOrderFromOverview(user.role, o.source),
      ...(canSeeOrderMoney(user.role)
        ? { money: { priceMdl: serializeOrderPrice(o.price), isPaid: o.isPaid } }
        : {}),
    },
    lines,
    history: historyForRole(history, user.role).slice(0, OVERVIEW_HISTORY_LIMIT),
  };
}
