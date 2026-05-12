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
        files: { select: { id: true, copies: true } },
      },
    });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.productType !== "mug") {
      return NextResponse.json({ error: "Not a mug order" }, { status: 400 });
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

    // Remove old files and add the new rendered PNG
    const oldFileIds = order.files.map((f) => f.id);
    const preservedQty = mugOrderStockQuantityFromFiles(order.files);
    const layoutCopies = validated.copies ?? preservedQty;

    await prisma.$transaction([
      prisma.file.deleteMany({ where: { id: { in: oldFileIds } } }),
      prisma.file.create({
        data: {
          orderId: order.id,
          fileUrl: validated.fileUrl,
          fileName: validated.fileName,
          copies: layoutCopies,
          color: "color",
        },
      }),
      prisma.order.update({
        where: { id },
        data: {
          mugLayoutData: validated.mugLayoutData
            ? (validated.mugLayoutData as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          status: "IN_PROGRESS",
          approvalFeedback: null,
          ...(mugProductPatch
            ? {
                mugProductId: mugProductPatch.mugProductId,
                mugProductSnapshot: mugProductPatch.mugProductSnapshot,
              }
            : {}),
        },
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
