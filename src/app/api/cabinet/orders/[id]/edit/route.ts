import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";
import { UNPAID_SHOP_ORDER_WHERE } from "@/lib/shop/orderFlags";
import { CABINET_VISIBLE_ORDER_WHERE } from "@/lib/cabinetOrderScope";
import { serializeOrderPrice } from "@/lib/orderPriceDecimal";
import { dealerModifyBlockReason } from "@/lib/dealerOrderModify";
import { toDealerEditLine } from "@/lib/dealerOrderEditView";

/**
 * The dealer wizard's edit-mode prefill for an own order: positions, their
 * settings and files, rebuilt cost-free (`toDealerEditLine`). Refuses (409)
 * once the order can no longer be changed, 404 for anything not the dealer's.
 */
export async function GET(
  _request: NextRequest,
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

  const order = await prisma.order.findFirst({
    where: {
      id,
      clientId: user.studioCustomerId,
      ...CABINET_VISIBLE_ORDER_WHERE,
      NOT: UNPAID_SHOP_ORDER_WHERE,
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      isPaid: true,
      source: true,
      deletedAt: true,
      cancelledAt: true,
      phone: true,
      clientName: true,
      notes: true,
      price: true,
      orderLines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          productType: true,
          stockVariantId: true,
          largeFormatMaterialId: true,
          sheetPaperId: true,
          mugLayoutData: true,
          notebookLayoutData: true,
          penLayoutData: true,
          mugProductSnapshot: true,
          notebookProductSnapshot: true,
          penProductSnapshot: true,
          largeFormatLineData: true,
          businessCardLineData: true,
          dtfLineData: true,
          uvLineData: true,
          sublimationLineData: true,
          files: {
            select: { id: true, fileName: true, copies: true, color: true, paperType: true, pageCount: true },
          },
        },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const block = dealerModifyBlockReason(order);
  if (block) {
    return NextResponse.json(
      { error: "Order can no longer be changed", code: "order_locked", reason: block },
      { status: 409 },
    );
  }

  return NextResponse.json({
    id: order.id,
    orderNumber: order.orderNumber,
    phone: order.phone,
    clientName: order.clientName,
    clientId: null,
    studioClient: null,
    notes: order.notes,
    price: serializeOrderPrice(order.price),
    orderLines: order.orderLines.map(toDealerEditLine),
  });
}
