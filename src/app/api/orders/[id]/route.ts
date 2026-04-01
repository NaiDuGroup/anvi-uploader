import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateOrderSchema } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";

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
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updateOrderSchema.parse(body);

    if (user.role === "workshop") {
      const order = await prisma.order.findUnique({ where: { id } });
      if (!order || !order.isWorkshop) {
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
      if (
        validated.isWorkshop !== undefined ||
        validated.isPrio !== undefined ||
        validated.assignedTo !== undefined ||
        validated.phone !== undefined ||
        validated.clientName !== undefined ||
        validated.notes !== undefined
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
    if (validated.issueReason !== undefined) data.issueReason = validated.issueReason;
    if (validated.phone !== undefined) data.phone = validated.phone;
    if (validated.clientName !== undefined) data.clientName = validated.clientName;
    if (validated.notes !== undefined) data.notes = validated.notes;

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
    if (validated.status === "NEW" || validated.status === "IN_PROGRESS") {
      data.isWorkshop = false;
    }

    if (validated.status === "DELIVERED") {
      data.isPrio = false;
    }

    if (validated.items && user.role === "admin") {
      await prisma.$transaction(async (tx) => {
        // Collect IDs of existing files the client wants to keep
        const keepFileIds = new Set<string>();
        for (const item of validated.items!) {
          for (const f of item.files) {
            if ("existingFileId" in f) keepFileIds.add(f.existingFileId);
          }
        }

        // Detach kept files from their current items (prevent cascade delete)
        if (keepFileIds.size > 0) {
          await tx.file.updateMany({
            where: { id: { in: [...keepFileIds] } },
            data: { orderItemId: null },
          });
        }

        // Delete all existing order items (cascades to non-detached files)
        await tx.orderItem.deleteMany({ where: { orderId: id } });

        // Create new items and attach files
        for (const item of validated.items!) {
          const newItem = await tx.orderItem.create({
            data: {
              orderId: id,
              categoryId: item.categoryId ?? null,
              productId: item.productId ?? null,
              customerProvided: item.customerProvided ?? false,
              quantity: item.quantity,
              width: item.width ?? null,
              height: item.height ?? null,
              unitPrice: item.unitPrice ?? null,
              totalPrice: item.totalPrice ?? null,
              priceOverride: item.priceOverride ?? false,
              attributes: (item.attributes as Prisma.InputJsonValue) ?? undefined,
              notes: item.notes ?? null,
            },
          });

          for (const f of item.files) {
            if ("existingFileId" in f) {
              await tx.file.update({
                where: { id: f.existingFileId },
                data: { orderItemId: newItem.id },
              });
            } else {
              await tx.file.create({
                data: {
                  orderId: id,
                  orderItemId: newItem.id,
                  fileName: f.fileName,
                  fileUrl: f.fileUrl,
                  pageCount: f.pageCount ?? null,
                },
              });
            }
          }
        }

        // Clean up any orphaned files (detached but not re-attached)
        await tx.file.deleteMany({
          where: {
            orderId: id,
            orderItemId: null,
            id: { in: [...keepFileIds] },
          },
        });
      });

      const itemTotal = validated.items!.reduce(
        (sum, item) => sum + (item.totalPrice ?? 0),
        0,
      );
      data.totalPrice = itemTotal || null;
    }

    const order = await prisma.order.update({
      where: { id },
      data,
      include: {
        files: true,
        items: {
          include: {
            files: true,
            category: { select: { id: true, name: true, slug: true } },
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    return NextResponse.json(order);
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

  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: only admin can delete orders" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    await prisma.order.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete order:", error);
    return NextResponse.json(
      { error: "Failed to delete order" },
      { status: 500 },
    );
  }
}
