import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { mugLayoutDataSchema } from "@/lib/validations";
import { resolveMugProductForOrder } from "@/lib/mug/resolveMugProductForOrder";
import { mugProductToSnapshot, otherMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { z } from "zod";

const patchSchema = z.object({
  mugLayoutData: mugLayoutDataSchema.nullable(),
  fileUrl: z.string().min(1),
  fileName: z.string().min(1),
  mugProductId: z.string().uuid().optional(),
  mugOther: z.boolean().optional(),
  copies: z.number().int().min(1).max(1_000_000).optional(),
  /** When set, edits this mug `OrderLine`; otherwise the first mug line. */
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
          where: { productType: "mug" },
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
      return NextResponse.json({ error: "Not a mug order" }, { status: 400 });
    }

    const targetLine = validated.orderLineId
      ? order.orderLines.find((l) => l.id === validated.orderLineId)
      : order.orderLines[0];
    if (!targetLine) {
      return NextResponse.json({ error: "Mug line not found" }, { status: 400 });
    }

    let mugProductPatch: {
      mugProductId: string | null;
      mugProductSnapshot: Prisma.InputJsonValue;
    } | undefined;

    if (validated.mugOther) {
      mugProductPatch = {
        mugProductId: null,
        mugProductSnapshot: otherMugProductSnapshot() as unknown as Prisma.InputJsonValue,
      };
    } else if (validated.mugProductId) {
      const p = await resolveMugProductForOrder(validated.mugProductId);
      if (!p) {
        return NextResponse.json({ error: "Invalid mug product" }, { status: 400 });
      }
      mugProductPatch = {
        mugProductId: p.id,
        mugProductSnapshot: mugProductToSnapshot(p) as unknown as Prisma.InputJsonValue,
      };
    }

    const oldFileIds = targetLine.files.map((f) => f.id);
    const preservedQty = mugOrderStockQuantityFromFiles(targetLine.files);
    const layoutCopies = validated.copies ?? preservedQty;

    const orderLineUpdate: Prisma.OrderLineUpdateInput = {
      mugLayoutData: validated.mugLayoutData
        ? (validated.mugLayoutData as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      ...(mugProductPatch
        ? {
            mugProductId: mugProductPatch.mugProductId,
            mugProductSnapshot: mugProductPatch.mugProductSnapshot,
          }
        : {}),
    };

    const orderUpdate: Prisma.OrderUncheckedUpdateInput = {
      status: "IN_PROGRESS",
      approvalFeedback: null,
    };
    if (order.productType === "mug") {
      orderUpdate.mugLayoutData = validated.mugLayoutData
        ? (validated.mugLayoutData as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull;
      if (mugProductPatch) {
        orderUpdate.mugProductId = mugProductPatch.mugProductId;
        orderUpdate.mugProductSnapshot = mugProductPatch.mugProductSnapshot;
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
        data: orderLineUpdate,
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
    console.error("PATCH /api/admin/orders/[id]/mug-layout:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
