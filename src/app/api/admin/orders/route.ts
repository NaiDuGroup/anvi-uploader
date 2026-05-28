import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { HEAVY_TX_OPTIONS, prisma } from "@/lib/prisma";
import { createAdminOrderSchema } from "@/lib/validations";
import {
  serializeOrderWithPrice,
  toOrderPriceDecimal,
} from "@/lib/orderPriceDecimal";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { nanoid } from "nanoid";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
import {
  AdminOrderResolveError,
  buildOrderDenormalizedScalars,
  computeOrderProductTypeForAdmin,
  deductStockForAdminOrderLines,
  normalizeAdminOrderLineInputs,
  resolveAdminOrderLineProducts,
  type ResolvedAdminOrderLine,
} from "@/lib/adminOrderCreateHelpers";

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
    const resolved: ResolvedAdminOrderLine[] = [];
    for (const line of lineInputs) {
      resolved.push(await resolveAdminOrderLineProducts(line));
    }

    const orderProductType = computeOrderProductTypeForAdmin(resolved);
    const denorm = buildOrderDenormalizedScalars(orderProductType, resolved);

    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
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
      });

      for (let i = 0; i < resolved.length; i++) {
        const r = resolved[i]!;
        const li = r.input;
        await tx.orderLine.create({
          data: {
            orderId: o.id,
            sortOrder: i,
            productType: li.productType,
            mugLayoutData:
              li.productType === "mug" && li.mugLayoutData != null
                ? (li.mugLayoutData as unknown as Prisma.InputJsonValue)
                : undefined,
            mugProductId: r.mugExtras?.mugProductId ?? undefined,
            mugProductSnapshot: r.mugExtras?.mugProductSnapshot ?? undefined,
            notebookLayoutData:
              li.productType === "notebook" && li.notebookLayoutData != null
                ? (li.notebookLayoutData as unknown as Prisma.InputJsonValue)
                : undefined,
            notebookProductId: r.notebookExtras?.notebookProductId ?? undefined,
            notebookProductSnapshot: r.notebookExtras?.notebookProductSnapshot ?? undefined,
            largeFormatMaterialId:
              li.productType === "large_format_print"
                ? r.largeFormatExtras?.largeFormatMaterialId
                : undefined,
            largeFormatLineData:
              li.productType === "large_format_print"
                ? r.largeFormatExtras?.largeFormatLineData
                : undefined,
            files: {
              create: li.files.map((file) => ({
                orderId: o.id,
                fileName: file.fileName,
                fileUrl: file.fileUrl,
                copies: file.copies,
                color: file.color,
                paperType: file.paperType,
                pageCount: file.pageCount,
              })),
            },
          },
        });
      }

      const stockRes = await deductStockForAdminOrderLines(tx, {
        orderId: o.id,
        orderNumber: o.orderNumber,
        createdById: user.id,
        resolved,
      });
      const needsProcurement = stockRes.needsProcurement;
      const procurementMeta = stockRes.procurementMeta;

      let out = await tx.order.findUniqueOrThrow({
        where: { id: o.id },
        include: {
          files: true,
          orderLines: {
            orderBy: { sortOrder: "asc" },
            include: { files: true },
          },
        },
      });

      if (needsProcurement && procurementMeta) {
        out = await tx.order.update({
          where: { id: o.id },
          data: {
            needsProcurement: true,
            procurementMeta,
          },
          include: {
            files: true,
            orderLines: {
              orderBy: { sortOrder: "asc" },
              include: { files: true },
            },
          },
        });
      }

      await tx.orderLog.create({
        data: {
          orderId: out.id,
          userId: user.id,
          action: "order_created",
        },
      });

      if (validated.fromInvoiceLineItemId) {
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
      }

      return out;
    }, HEAVY_TX_OPTIONS);

    return NextResponse.json(serializeOrderWithPrice(order), { status: 201 });
  } catch (error) {
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
