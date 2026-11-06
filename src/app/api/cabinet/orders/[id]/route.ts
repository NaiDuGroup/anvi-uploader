import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UNPAID_SHOP_ORDER_WHERE } from "@/lib/shop/orderFlags";
import { getCustomerSessionUser } from "@/lib/auth";
import { serializeOrderWithPrice } from "@/lib/orderPriceDecimal";
import { getUnreadClientMessageCountMap } from "@/lib/clientMessagesUnread";
import { toCabinetOrderLineView, toPublicProductSnapshot } from "@/lib/cabinetOrderLineView";
import { fillDtfGarmentNames } from "@/lib/dtf/dtfGarmentNames";
import { toCabinetStatusTimeline } from "@/lib/cabinetOrderTimeline";
import { CABINET_VISIBLE_ORDER_WHERE } from "@/lib/cabinetOrderScope";
import { getStudioPickupAddress } from "@/lib/studioInfo/studioPickupAddress";
import { dealerModifyBlockReason, dealerOrderActionsState } from "@/lib/dealerOrderModify";
import { toLayoutIssueView } from "@/lib/layoutIssue";
import { dealerOrderUpdateSchema, getCabinetVisibleStatus } from "@/lib/validations";
import { DealerOrderModifyError, dealerEditOrder } from "@/lib/orderCreate/dealerOrderModify";
import { dealerModifyErrorResponse } from "@/lib/orderCreate/dealerOrderModifyHttp";
import { AdminOrderResolveError, OrderLineLimitError } from "@/lib/adminOrderCreateHelpers";
import { AdminOrderUpdateError } from "@/lib/adminOrderUpdateHelpers";
import { ZodError } from "zod";

/**
 * Customer-facing order detail. Snapshots and line JSON hold purchase costs,
 * dealer prices, paper / ink costs and production settings, so every one is
 * reduced to a whitelisted public view before it leaves the server.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: {
      id,
      clientId: user.studioCustomerId!,
      // Live orders and orders the dealer cancelled (shown greyed «Отменён»).
      ...CABINET_VISIBLE_ORDER_WHERE,
      // Unpaid storefront orders are hidden from the cabinet until paid.
      NOT: UNPAID_SHOP_ORDER_WHERE,
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      productType: true,
      phone: true,
      notes: true,
      price: true,
      isPaid: true,
      paidAt: true,
      // Shown to anyone with the tracking link too, so fine for the owner.
      issueReason: true,
      // The customer's own words from the proof-approval page.
      approvalFeedback: true,
      createdAt: true,
      mugProductSnapshot: true,
      notebookProductSnapshot: true,
      penProductSnapshot: true,
      publicToken: true,
      source: true,
      deletedAt: true,
      cancelledAt: true,
      cancelReason: true,
      dealerEditedAt: true,
      files: {
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          copies: true,
          color: true,
          paperType: true,
          pageCount: true,
          orderLineId: true,
        },
      },
      // Positions ("lines") so multi-product orders group their files per
      // position in the cabinet detail view.
      orderLines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          productType: true,
          mugProductSnapshot: true,
          notebookProductSnapshot: true,
          penProductSnapshot: true,
          largeFormatLineData: true,
          businessCardLineData: true,
          dtfLineData: true,
          uvLineData: true,
          sublimationLineData: true,
          // «Нужен макет»: shown to the owner (reason, workshop comment, since when);
          // also locks edit / cancel once any line prints.
          productionStatus: true,
          layoutIssueReason: true,
          layoutIssueNote: true,
          layoutIssueAt: true,
          layoutFixedAt: true,
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await fillDtfGarmentNames(order.orderLines);

  const [unreadMap, statusLogs] = await Promise.all([
    getUnreadClientMessageCountMap([order.id], user.id, "customer"),
    // Status changes only: time + new status (who changed it stays out).
    prisma.orderLog.findMany({
      where: { orderId: order.id, action: "status_changed", field: "status" },
      select: { oldValue: true, newValue: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const timeline = toCabinetStatusTimeline(order.createdAt, statusLogs, order.status);
  if (order.cancelledAt) timeline.push({ status: "cancelled", at: order.cancelledAt.toISOString() });

  const studioAddress =
    getCabinetVisibleStatus(order) === "readyInStudio" ? await getStudioPickupAddress() : null;

  // Edit / cancel buttons: dealers only, on their own orders (this query is scoped to them).
  const isDealer = user.studioCustomer?.isDealer === true;
  const { source: _source, deletedAt: _deletedAt, ...publicOrder } = order;
  void _source;
  void _deletedAt;

  return NextResponse.json({
    ...serializeOrderWithPrice({
      ...publicOrder,
      issueReason: order.status === "ISSUE" ? order.issueReason : null,
      // Legacy single-product orders keep the snapshot on the order itself.
      mugProductSnapshot: toPublicProductSnapshot(order.mugProductSnapshot),
      notebookProductSnapshot: toPublicProductSnapshot(order.notebookProductSnapshot),
      penProductSnapshot: toPublicProductSnapshot(order.penProductSnapshot),
      orderLines: order.orderLines.map((line) => ({
        sortOrder: line.sortOrder,
        ...toCabinetOrderLineView(line, { sheetImposition: true }),
        // Null unless the line waits for the owner's new file.
        layoutIssue: order.cancelledAt ? null : toLayoutIssueView(line),
        layoutFixedAt: line.layoutFixedAt?.toISOString() ?? null,
        // Only to word «the other positions are in work / queued» under a flagged one.
        productionStatus: order.cancelledAt ? null : line.productionStatus,
      })),
    }),
    statusTimeline: timeline,
    unreadMessageCount: unreadMap.get(order.id) ?? 0,
    dealerActions: isDealer ? dealerOrderActionsState(order) : "hidden",
    dealerLockReason: isDealer ? dealerModifyBlockReason(order) : null,
    studioAddress,
  });
}

/**
 * Dealer edit of an own order from the cabinet wizard (edit mode). Body:
 * {@link dealerOrderUpdateSchema} (`dryRun: true` only re-prices). Allowed
 * only until printing starts (`canDealerModifyOrder`); another client's order
 * answers 404 like a missing one. Prices come from the server only, and the
 * answer carries totals only — never line JSON or costs.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCustomerSessionUser();
  if (!user || !user.studioCustomer || !user.studioCustomerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.studioCustomer.isDealer !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const input = dealerOrderUpdateSchema.parse(await request.json());
    const result = await dealerEditOrder({
      orderId: id,
      actor: { userId: user.id, studioCustomerId: user.studioCustomerId },
      input,
    });
    if (input.dryRun) {
      return NextResponse.json({ lineTotalsMdl: result.lineTotalsMdl, totalMdl: result.totalMdl });
    }
    return NextResponse.json({ id, price: result.totalMdl });
  } catch (error) {
    if (error instanceof DealerOrderModifyError) return dealerModifyErrorResponse(error);
    if (error instanceof OrderLineLimitError) {
      return NextResponse.json({ error: "Too many positions", code: error.code }, { status: 400 });
    }
    if (error instanceof AdminOrderResolveError) {
      return NextResponse.json({ error: error.message, code: error.message }, { status: 400 });
    }
    if (error instanceof AdminOrderUpdateError) {
      return NextResponse.json({ error: error.message, code: "invalid_lines" }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    console.error("Failed to update dealer order:", error);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}
