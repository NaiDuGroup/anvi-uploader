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
import { z } from "zod";

const patchSchema = z.object({
  notebookLayoutData: notebookLayoutDataSchema.nullable(),
  fileUrl: z.string().min(1),
  fileName: z.string().min(1),
  notebookProductId: z.string().uuid().optional(),
  notebookOther: z.boolean().optional(),
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
        files: { select: { id: true } },
      },
    });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.productType !== "notebook") {
      return NextResponse.json({ error: "Not a notebook order" }, { status: 400 });
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
          notebookLayoutData: validated.notebookLayoutData
            ? (validated.notebookLayoutData as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          status: "IN_PROGRESS",
          approvalFeedback: null,
          ...(productPatch
            ? {
                notebookProductId: productPatch.notebookProductId,
                notebookProductSnapshot: productPatch.notebookProductSnapshot,
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
    console.error("PATCH /api/admin/orders/[id]/notebook-layout:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
