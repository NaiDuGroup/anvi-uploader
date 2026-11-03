import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";
import { serializeOrderWithPrice } from "@/lib/orderPriceDecimal";
import { getUnreadClientMessageCountMap } from "@/lib/clientMessagesUnread";
import { toCabinetOrderLineView, toPublicProductSnapshot } from "@/lib/cabinetOrderLineView";

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

  const unreadMap = await getUnreadClientMessageCountMap(
    [order.id],
    user.id,
    "customer",
  );

  return NextResponse.json({
    ...serializeOrderWithPrice({
      ...order,
      // Legacy single-product orders keep the snapshot on the order itself.
      mugProductSnapshot: toPublicProductSnapshot(order.mugProductSnapshot),
      notebookProductSnapshot: toPublicProductSnapshot(order.notebookProductSnapshot),
      penProductSnapshot: toPublicProductSnapshot(order.penProductSnapshot),
      orderLines: order.orderLines.map((line) => ({
        sortOrder: line.sortOrder,
        ...toCabinetOrderLineView(line, { sheetImposition: true }),
      })),
    }),
    unreadMessageCount: unreadMap.get(order.id) ?? 0,
  });
}
