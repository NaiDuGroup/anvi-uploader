import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UNPAID_SHOP_ORDER_WHERE } from "@/lib/shop/orderFlags";
import { getCustomerSessionUser } from "@/lib/auth";
import { serializeOrderWithPrice } from "@/lib/orderPriceDecimal";
import { getUnreadClientMessageCountMap } from "@/lib/clientMessagesUnread";
import { toCabinetOrderLineView, toPublicProductSnapshot } from "@/lib/cabinetOrderLineView";
import { toCabinetStatusTimeline } from "@/lib/cabinetOrderTimeline";

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
      deletedAt: null,
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
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [unreadMap, statusLogs] = await Promise.all([
    getUnreadClientMessageCountMap([order.id], user.id, "customer"),
    // Status changes only: time + new status (who changed it stays out).
    prisma.orderLog.findMany({
      where: { orderId: order.id, action: "status_changed", field: "status" },
      select: { newValue: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    ...serializeOrderWithPrice({
      ...order,
      issueReason: order.status === "ISSUE" ? order.issueReason : null,
      // Legacy single-product orders keep the snapshot on the order itself.
      mugProductSnapshot: toPublicProductSnapshot(order.mugProductSnapshot),
      notebookProductSnapshot: toPublicProductSnapshot(order.notebookProductSnapshot),
      penProductSnapshot: toPublicProductSnapshot(order.penProductSnapshot),
      orderLines: order.orderLines.map((line) => ({
        sortOrder: line.sortOrder,
        ...toCabinetOrderLineView(line, { sheetImposition: true }),
      })),
    }),
    statusTimeline: toCabinetStatusTimeline(order.createdAt, statusLogs),
    unreadMessageCount: unreadMap.get(order.id) ?? 0,
  });
}
