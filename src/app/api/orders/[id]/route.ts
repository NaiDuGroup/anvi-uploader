import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateOrderSchema, type UpdateOrderInput } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { buildUpdateLogEntries } from "@/lib/orderLog";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { recordMugStockReturnOnOrderDelete } from "@/lib/mug/mugStockLedger";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import { recordNotebookStockReturnOnOrderDelete } from "@/lib/notebook/notebookStockLedger";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { INK_STOCK_KIND } from "@/lib/ink/inkStockKinds";
import { restoreInkMl, restoreLfRollStock } from "@/lib/largeFormat/lfRollStockLedger";
import { LF_ROLL_STOCK_KIND } from "@/lib/largeFormat/lfRollStockKinds";
import { DEFAULT_PRINT_PROCESS } from "@/lib/printProcess";
import {
  serializeOrderWithPrice,
  toOrderPriceDecimal,
} from "@/lib/orderPriceDecimal";

const WORKSHOP_ALLOWED_STATUSES = new Set([
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
  "RETURNED_TO_STUDIO",
  "DELIVERED",
  "ISSUE",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Per-step millisecond timings, surfaced as a `Server-Timing` header and a
  // structured server log so the prod latency of a status change can be split
  // into session lookup / reads / write / log write. Mirrors the diagnostic
  // pattern already used by GET /api/orders (see `src/app/api/orders/route.ts`).
  const handlerStartedAt = Date.now();
  const timings: Record<string, number> = {};
  const measure = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await run();
    } finally {
      timings[label] = (timings[label] ?? 0) + (Date.now() - startedAt);
    }
  };

  const user = await measure("sessionUser", () => getSessionUser());
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updateOrderSchema.parse(body);

    const oldOrder = await measure("findOldOrder", () =>
      prisma.order.findUnique({
        where: { id },
        include: { files: true },
      }),
    );

    if (!oldOrder || oldOrder.deletedAt) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (user.role === "workshop") {
      if (!oldOrder.isWorkshop) {
        return NextResponse.json(
          { error: "Forbidden: order not assigned to workshop" },
          { status: 403 }
        );
      }
      if (validated.status && !WORKSHOP_ALLOWED_STATUSES.has(validated.status)) {
        return NextResponse.json(
          { error: "Forbidden: workshop cannot set this status" },
          { status: 403 }
        );
      }
      // `notes` and `isPrio` are intentionally allowed for the workshop role:
      // cell admins need to amend the yellow sticky note straight from the
      // order list (e.g. "9 burgundy notebooks", colour clarifications) and
      // flag/unflag rush orders that the front-office didn't mark up front.
      // All other structural/financial fields stay locked.
      if (
        validated.isWorkshop !== undefined ||
        validated.isPaid !== undefined ||
        validated.price !== undefined ||
        validated.assignedTo !== undefined ||
        validated.phone !== undefined ||
        validated.clientName !== undefined ||
        validated.clientId !== undefined ||
        validated.removeFileIds !== undefined ||
        validated.addFiles !== undefined ||
        validated.updateFiles !== undefined
      ) {
        return NextResponse.json(
          { error: "Forbidden: workshop cannot edit order details" },
          { status: 403 }
        );
      }
    }

    const data: Record<string, unknown> = {};

    if (validated.status !== undefined) data.status = validated.status;
    if (validated.assignedTo !== undefined) data.assignedTo = validated.assignedTo;
    if (validated.isWorkshop !== undefined) data.isWorkshop = validated.isWorkshop;
    if (validated.isPrio !== undefined) data.isPrio = validated.isPrio;
    if (validated.isPaid !== undefined) data.isPaid = validated.isPaid;
    if (validated.price !== undefined) {
      data.price = toOrderPriceDecimal(validated.price);
    }
    if (validated.issueReason !== undefined) data.issueReason = validated.issueReason;
    if (validated.phone !== undefined) data.phone = validated.phone;
    if (validated.clientName !== undefined) data.clientName = validated.clientName;
    if (validated.notes !== undefined) data.notes = validated.notes;

    if (isAdmin(user.role)) {
      if (validated.clientId !== undefined) {
        if (validated.clientId !== null) {
          const c = await measure("clientLookup", () =>
            prisma.studioCustomer.findUnique({
              where: { id: validated.clientId as string },
              select: { id: true },
            }),
          );
          if (!c) {
            return NextResponse.json({ error: "Client not found" }, { status: 400 });
          }
        }
        data.clientId = validated.clientId;
      } else if (validated.phone !== undefined && oldOrder.clientId === null) {
        const auto = await findClientIdByOrderPhone(validated.phone);
        if (auto) data.clientId = auto;
      }
    }

    const nextClientId: string | null =
      data.clientId !== undefined
        ? (data.clientId as string | null)
        : oldOrder.clientId;

    if (isAdmin(user.role) && nextClientId) {
      const c = await measure("clientLookup", () =>
        prisma.studioCustomer.findUnique({
          where: { id: nextClientId },
          select: { kind: true, phone: true, personName: true, companyName: true },
        }),
      );
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
      data.phone = oc.phone;
      data.clientName = oc.clientName;
    }

    const forLog: UpdateOrderInput = { ...validated };
    if (
      isAdmin(user.role) &&
      typeof data.clientId !== "undefined" &&
      validated.clientId === undefined
    ) {
      forLog.clientId = data.clientId as string | null;
    }

    if (isAdmin(user.role) && nextClientId) {
      forLog.phone = data.phone as string;
      forLog.clientName = (data.clientName as string | null) ?? null;
    }

    const logEntries = buildUpdateLogEntries(oldOrder, forLog, user.id);

    if (validated.status !== undefined) {
      data.assignedTo = user.id;
    }

    if (validated.status && validated.status !== "ISSUE") {
      data.issueReason = null;
    }

    if (
      validated.status === "SENT_TO_WORKSHOP" ||
      validated.status === "WORKSHOP_PRINTING" ||
      validated.status === "WORKSHOP_READY"
    ) {
      data.isWorkshop = true;
      if (validated.status === "SENT_TO_WORKSHOP") {
        data.sentToWorkshopBy = user.id;
      }
    }
    if (
      validated.status === "NEW" ||
      validated.status === "IN_PROGRESS" ||
      validated.status === "READY_IN_STUDIO"
    ) {
      data.isWorkshop = false;
    }

    if (validated.status === "DELIVERED") {
      data.isPrio = false;
      if (!oldOrder.isPaid) {
        data.isPaid = true;
        logEntries.push({
          orderId: id,
          userId: user.id,
          action: "field_updated",
          field: "isPaid",
          oldValue: "false",
          newValue: "true",
        });
      }
    }

    if (validated.removeFileIds && validated.removeFileIds.length > 0) {
      await measure("fileMutations", () =>
        prisma.file.deleteMany({
          where: { id: { in: validated.removeFileIds }, orderId: id },
        }),
      );
    }

    if (validated.updateFiles && validated.updateFiles.length > 0) {
      await measure("fileMutations", () =>
        Promise.all(
          validated.updateFiles!.map((uf) =>
            prisma.file.update({
              where: { id: uf.id },
              data: {
                ...(uf.copies !== undefined && { copies: uf.copies }),
                ...(uf.color !== undefined && { color: uf.color }),
                ...(uf.paperType !== undefined && { paperType: uf.paperType }),
              },
            }),
          ),
        ),
      );
    }

    if (validated.addFiles && validated.addFiles.length > 0) {
      const anchorLine = await measure("fileMutations", () =>
        prisma.orderLine.findFirst({
          where: { orderId: id },
          orderBy: { sortOrder: "asc" },
          select: { id: true },
        }),
      );
      if (!anchorLine) {
        return NextResponse.json(
          { error: "Order has no product lines; cannot add files" },
          { status: 400 },
        );
      }
      await measure("fileMutations", () =>
        prisma.file.createMany({
          data: validated.addFiles!.map((f) => ({
            orderId: id,
            orderLineId: anchorLine.id,
            fileName: f.fileName,
            fileUrl: f.fileUrl,
            copies: f.copies,
            color: f.color,
            paperType: f.paperType ?? null,
            pageCount: f.pageCount ?? null,
          })),
        }),
      );
    }

    const order = await measure("orderUpdate", () =>
      prisma.order.update({
        where: { id },
        data,
        include: {
          files: true,
          orderLines: {
            orderBy: { sortOrder: "asc" },
            include: { files: true },
          },
          studioClient: {
            select: {
              id: true,
              kind: true,
              phone: true,
              personName: true,
              companyName: true,
              companyIdno: true,
            },
          },
        },
      }),
    );

    if (logEntries.length > 0) {
      await measure("orderLogWrite", () =>
        prisma.orderLog.createMany({ data: logEntries }),
      );
    }

    const totalMs = Date.now() - handlerStartedAt;
    const timingParts = Object.entries(timings).map(
      ([label, ms]) => `${label};dur=${ms.toFixed(1)}`,
    );
    timingParts.push(`orderUpdateHandler;dur=${totalMs.toFixed(1)}`);
    const response = NextResponse.json(serializeOrderWithPrice(order));
    response.headers.set("Server-Timing", timingParts.join(","));
    response.headers.set("X-Order-Update-Server-Time-Ms", totalMs.toFixed(1));
    console.log(
      `[orders.patch] id=${id} status=${validated.status ?? "-"} total=${totalMs.toFixed(1)}ms ${timingParts.join(" ")}`,
    );
    return response;
  } catch (error) {
    console.error("Failed to update order:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: only admin can delete orders" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        files: true,
        orderLines: { include: { files: true } },
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.deletedAt) {
      return NextResponse.json({ error: "Order is already in trash" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      if (!order.needsProcurement) {
        for (const line of order.orderLines) {
          if (line.productType === "mug" && line.mugProductId) {
            const mugQty = mugOrderStockQuantityFromFiles(line.files);
            if (mugQty > 0) {
              await recordMugStockReturnOnOrderDelete(tx, {
                mugProductId: line.mugProductId,
                quantity: mugQty,
                orderId: order.id,
                orderNumber: order.orderNumber,
                createdById: user.id,
              });
            }
          } else if (line.productType === "notebook" && line.notebookProductId) {
            const nbQty = notebookOrderStockQuantityFromFiles(line.files);
            if (nbQty > 0) {
              await recordNotebookStockReturnOnOrderDelete(tx, {
                notebookProductId: line.notebookProductId,
                quantity: nbQty,
                orderId: order.id,
                orderNumber: order.orderNumber,
                createdById: user.id,
              });
            }
          } else if (
            line.productType === "large_format_print" &&
            line.largeFormatMaterialId
          ) {
            const lf = parseLargeFormatLineData(line.largeFormatLineData);
            if (lf) {
              const lm = lf.calculatedLinearMeters;
              const inkMl = lf.inkMlUsed ?? 0;
              if (lm > 0) {
                await restoreLfRollStock(tx, line.largeFormatMaterialId, lm, {
                  kind: LF_ROLL_STOCK_KIND.ORDER_RETURN,
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  orderLineId: line.id,
                  materialCostMdl: Number.isFinite(lf.materialCost)
                    ? Math.round(lf.materialCost)
                    : null,
                  materialSellPriceMdl: Number.isFinite(lf.materialSellPrice)
                    ? Math.round(lf.materialSellPrice)
                    : null,
                  createdById: user.id,
                });
              }
              if (inkMl > 0) {
                await restoreInkMl(tx, inkMl, DEFAULT_PRINT_PROCESS, {
                  kind: INK_STOCK_KIND.ORDER_RETURN,
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  orderLineId: line.id,
                  inkCostMdl:
                    lf.inkCostMdl != null && Number.isFinite(lf.inkCostMdl)
                      ? Math.round(lf.inkCostMdl)
                      : null,
                  inkSellPriceMdl:
                    lf.inkSellPriceMdl != null &&
                    Number.isFinite(lf.inkSellPriceMdl)
                      ? Math.round(lf.inkSellPriceMdl)
                      : null,
                  createdById: user.id,
                });
              }
            }
          }
        }
      }

      await tx.orderLog.create({
        data: {
          orderId: id,
          userId: user.id,
          action: "deleted",
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete order:", error);
    return NextResponse.json(
      { error: "Failed to delete order" },
      { status: 500 },
    );
  }
}
