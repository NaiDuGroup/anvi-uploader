import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";
import { serializeOrderWithPrice } from "@/lib/orderPriceDecimal";
import { getUnreadClientMessageCountMap } from "@/lib/clientMessagesUnread";

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
      mugLayoutData: true,
      mugProductSnapshot: true,
      notebookLayoutData: true,
      notebookProductSnapshot: true,
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
          largeFormatLineData: true,
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
    ...serializeOrderWithPrice(order),
    unreadMessageCount: unreadMap.get(order.id) ?? 0,
  });
}
