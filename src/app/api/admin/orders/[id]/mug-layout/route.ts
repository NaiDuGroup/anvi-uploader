import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { mugLayoutDataSchema } from "@/lib/validations";
import { z } from "zod";

const patchSchema = z.object({
  mugLayoutData: mugLayoutDataSchema.nullable(),
  fileUrl: z.string().min(1),
  fileName: z.string().min(1),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const validated = patchSchema.parse(body);

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, productType: true, status: true, files: { select: { id: true } } },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.productType !== "mug") {
      return NextResponse.json({ error: "Not a mug order" }, { status: 400 });
    }

    // Remove old files and add the new rendered PNG
    const oldFileIds = order.files.map((f) => f.id);

    await prisma.$transaction([
      prisma.file.deleteMany({ where: { id: { in: oldFileIds } } }),
      prisma.file.create({
        data: {
          orderId: order.id,
          fileUrl: validated.fileUrl,
          fileName: validated.fileName,
          copies: 1,
          color: "color",
        },
      }),
      prisma.order.update({
        where: { id },
        data: {
          mugLayoutData: validated.mugLayoutData
            ? (validated.mugLayoutData as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          status: "PENDING_APPROVAL",
          approvalFeedback: null,
        },
      }),
    ]);

    const oldStatus = order.status;
    if (oldStatus !== "PENDING_APPROVAL") {
      await prisma.orderLog.create({
        data: {
          orderId: order.id,
          userId: user.id,
          action: "status_changed",
          field: "status",
          oldValue: oldStatus,
          newValue: "PENDING_APPROVAL",
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
