import { applyGiftSetsToResolved } from "@/lib/giftSet/giftSetServer";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminOrderSchema } from "@/lib/validations";
import {
  serializeOrderWithPrice,
  toOrderPriceDecimal,
} from "@/lib/orderPriceDecimal";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { nanoid } from "nanoid";
import { isSheetProductType } from "@/lib/sheetProduct/sheetProductConfig";
import { applyManualLinePriceToResolved } from "@/lib/orderLines/applyManualLinePrice";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
import {
  AdminOrderResolveError,
  buildOrderDenormalizedScalars,
  computeOrderProductTypeForAdmin,
  normalizeAdminOrderLineInputs,
  OrderLineLimitError,
} from "@/lib/adminOrderCreateHelpers";
import {
  createOrderWithResolvedLines,
  resolveOrderLines,
} from "@/lib/orderCreate/orderLines";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: only admin can create orders" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const validated = createAdminOrderSchema.parse(body);

    let clientId: string | null | undefined = validated.clientId ?? undefined;
    let phoneForOrder = validated.phone;
    let clientNameForOrder: string | null | undefined = validated.clientName;

    if (clientId) {
      const c = await prisma.studioCustomer.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          kind: true,
          phone: true,
          personName: true,
          companyName: true,
        },
      });
      if (!c) {
        return NextResponse.json({ error: "Client not found" }, { status: 400 });
      }
      const oc = orderContactFromStudioCustomer(c);
      if (oc.phone.length < 8) {
        return NextResponse.json(
          { error: "Linked client must have a phone number of at least 8 characters" },
          { status: 400 },
        );
      }
      phoneForOrder = oc.phone;
      clientNameForOrder = oc.clientName ?? undefined;
    } else {
      const linked = await findClientIdByOrderPhone(validated.phone);
      if (linked) clientId = linked;
    }

    const lineInputs = normalizeAdminOrderLineInputs(validated);
    const { resolved } = await resolveOrderLines(lineInputs);
    // Staff «ручная цена» of non-sheet lines (sheet lines: in the resolver).
    for (const r of resolved) {
      if (!isSheetProductType(r.input.productType)) applyManualLinePriceToResolved(r, r.input, null);
    }
    // «Набор»: the set price wins over a line's manual price; staff may set the price of one set.
    await applyGiftSetsToResolved(resolved, { allowManualPrice: true });

    const orderProductType = computeOrderProductTypeForAdmin(resolved);
    const denorm = buildOrderDenormalizedScalars(orderProductType, resolved);

    const order = await createOrderWithResolvedLines({
      order: {
        phone: phoneForOrder,
        clientName: clientNameForOrder,
        clientId: clientId ?? undefined,
        notes: validated.notes,
        price: toOrderPriceDecimal(validated.price) ?? undefined,
        ...denorm,
        status: "SENT_TO_WORKSHOP",
        isWorkshop: true,
        createdBy: user.id,
        sentToWorkshopBy: user.id,
        assignedTo: user.id,
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      resolved,
      actorId: user.id,
      afterCreate: async (tx, out) => {
        if (!validated.fromInvoiceLineItemId) return;
        const lineItem = await tx.invoiceLineItem.findUnique({
          where: { id: validated.fromInvoiceLineItemId },
          select: {
            id: true,
            orderId: true,
            invoice: { select: { clientId: true, status: true } },
          },
        });
        if (
          lineItem &&
          lineItem.orderId == null &&
          (lineItem.invoice.status === "DRAFT" ||
            lineItem.invoice.status === "ISSUED") &&
          lineItem.invoice.clientId === clientId
        ) {
          await tx.invoiceLineItem.update({
            where: { id: lineItem.id },
            data: { orderId: out.id },
          });
        }
      },
    });

    return NextResponse.json(serializeOrderWithPrice(order), { status: 201 });
  } catch (error) {
    if (error instanceof OrderLineLimitError) {
      return NextResponse.json(
        { error: "Too many positions", code: error.code },
        { status: 400 },
      );
    }
    if (error instanceof AdminOrderResolveError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to create admin order:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create order", detail: message },
      { status: 500 },
    );
  }
}
