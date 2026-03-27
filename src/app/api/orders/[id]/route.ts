import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateOrderSchema } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";

const WORKSHOP_ALLOWED_STATUSES = new Set([
  "WORKSHOP_PRINTING",
  "READY",
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
      if (validated.isWorkshop !== undefined || validated.assignedTo !== undefined) {
        return NextResponse.json(
          { error: "Forbidden: workshop cannot change assignment" },
          { status: 403 }
        );
      }
    }

    const order = await prisma.order.update({
      where: { id },
      data: validated,
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
