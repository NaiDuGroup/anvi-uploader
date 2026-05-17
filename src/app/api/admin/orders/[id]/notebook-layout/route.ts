import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { notebookLayoutDataSchema } from "@/lib/validations";
import { resolveNotebookProductForOrder } from "@/lib/notebook/resolveNotebookProductForOrder";
import {
  notebookProductToSnapshot,
  otherNotebookProductSnapshot,
} from "@/lib/notebook/notebookProductSnapshot";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import { z } from "zod";

const patchSchema = z.object({
  notebookLayoutData: notebookLayoutDataSchema.nullable(),
  fileUrl: z.string().min(1),
  fileName: z.string().min(1),
  notebookProductId: z.string().uuid().optional(),
  notebookOther: z.boolean().optional(),
  copies: z.number().int().min(1).max(1_000_000).optional(),
  orderLineId: z.string().uuid().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const validated = patchSchema.parse(body);

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        productType: true,
        status: true,
        deletedAt: true,
        orderLines: {
          where: { productType: "notebook" },
          orderBy: { sortOrder: "asc" },
          include: {
            files: { select: { id: true, copies: true } },
          },
        },
      },
    });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.orderLines.length === 0) {
      return NextResponse.json({ error: "Not a notebook order" }, { status: 400 });
    }

    const targetLine = validated.orderLineId
      ? order.orderLines.find((l) => l.id === validated.orderLineId)
      : order.orderLines[0];
    if (!targetLine) {
      return NextResponse.json({ error: "Notebook line not found" }, { status: 400 });
    }

    let productPatch:
      | {
          notebookProductId: string | null;
          notebookProductSnapshot: Prisma.InputJsonValue;
        }
      | undefined;

    if (validated.notebookOther) {
      productPatch = {
        notebookProductId: null,
        notebookProductSnapshot:
          otherNotebookProductSnapshot() as unknown as Prisma.InputJsonValue,
      };
    } else if (validated.notebookProductId) {
      const p = await resolveNotebookProductForOrder(validated.notebookProductId);
      if (!p) {
        return NextResponse.json({ error: "Invalid notebook product" }, { status: 400 });
      }
      productPatch = {
        notebookProductId: p.id,
        notebookProductSnapshot:
          notebookProductToSnapshot(p) as unknown as Prisma.InputJsonValue,
      };
    }

    const oldFileIds = targetLine.files.map((f) => f.id);
    const preservedQty = notebookOrderStockQuantityFromFiles(targetLine.files);
    const layoutCopies = validated.copies ?? preservedQty;

    const lineUpdate: Prisma.OrderLineUpdateInput = {
      notebookLayoutData: validated.notebookLayoutData
        ? (validated.notebookLayoutData as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      ...(productPatch
        ? {
            notebookProductId: productPatch.notebookProductId,
            notebookProductSnapshot: productPatch.notebookProductSnapshot,
          }
        : {}),
    };

    const orderUpdate: Prisma.OrderUncheckedUpdateInput = {
      status: "IN_PROGRESS",
      approvalFeedback: null,
    };
    if (order.productType === "notebook") {
      orderUpdate.notebookLayoutData = validated.notebookLayoutData
        ? (validated.notebookLayoutData as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull;
      if (productPatch) {
        orderUpdate.notebookProductId = productPatch.notebookProductId;
        orderUpdate.notebookProductSnapshot = productPatch.notebookProductSnapshot;
      }
    }

    await prisma.$transaction([
      prisma.file.deleteMany({ where: { id: { in: oldFileIds } } }),
      prisma.file.create({
        data: {
          orderId: order.id,
          orderLineId: targetLine.id,
          fileUrl: validated.fileUrl,
          fileName: validated.fileName,
          copies: layoutCopies,
          color: "color",
        },
      }),
      prisma.orderLine.update({
        where: { id: targetLine.id },
        data: lineUpdate,
      }),
      prisma.order.update({
        where: { id },
        data: orderUpdate,
      }),
    ]);

    const oldStatus = order.status;
    if (oldStatus !== "IN_PROGRESS") {
      await prisma.orderLog.create({
        data: {
          orderId: order.id,
          userId: user.id,
          action: "status_changed",
          field: "status",
          oldValue: oldStatus,
          newValue: "IN_PROGRESS",
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/admin/orders/[id]/notebook-layout:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
