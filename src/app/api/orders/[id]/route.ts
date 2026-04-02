import { NextRequest, NextResponse } from "next/server";
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
        validated.isPaid !== undefined ||
        validated.price !== undefined ||
        validated.assignedTo !== undefined ||
        validated.phone !== undefined ||
        validated.clientName !== undefined ||
        validated.notes !== undefined ||
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
    if (validated.price !== undefined) data.price = validated.price;
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

    if (validated.removeFileIds && validated.removeFileIds.length > 0) {
      await prisma.file.deleteMany({
        where: { id: { in: validated.removeFileIds }, orderId: id },
      });
    }

    if (validated.updateFiles && validated.updateFiles.length > 0) {
      await Promise.all(
        validated.updateFiles.map((uf) =>
          prisma.file.update({
            where: { id: uf.id },
            data: {
              ...(uf.copies !== undefined && { copies: uf.copies }),
              ...(uf.color !== undefined && { color: uf.color }),
              ...(uf.paperType !== undefined && { paperType: uf.paperType }),
            },
          }),
        ),
      );
    }

    if (validated.addFiles && validated.addFiles.length > 0) {
      await prisma.file.createMany({
        data: validated.addFiles.map((f) => ({
          orderId: id,
          fileName: f.fileName,
          fileUrl: f.fileUrl,
          copies: f.copies,
          color: f.color,
          paperType: f.paperType ?? null,
          pageCount: f.pageCount ?? null,
        })),
      });
    }

    const order = await prisma.order.update({
      where: { id },
      data,
      include: { files: true },
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
