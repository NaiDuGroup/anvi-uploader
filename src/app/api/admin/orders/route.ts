import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminOrderSchema } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";
import { nanoid } from "nanoid";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: only admin can create orders" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const validated = createAdminOrderSchema.parse(body);

    const orderTotal = validated.items.reduce(
      (sum, item) => sum + (item.totalPrice ?? 0),
      0,
    );

    const order = await prisma.order.create({
      data: {
        phone: validated.phone,
        clientName: validated.clientName,
        notes: validated.notes,
        totalPrice: orderTotal || null,
        status: "SENT_TO_WORKSHOP",
        isWorkshop: true,
        createdBy: user.id,
        sentToWorkshopBy: user.id,
        assignedTo: user.id,
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        items: {
          create: validated.items.map((item) => ({
            categoryId: item.categoryId,
            productId: item.productId,
            customerProvided: item.customerProvided ?? false,
            quantity: item.quantity,
            width: item.width ?? null,
            height: item.height ?? null,
            unitPrice: item.unitPrice ?? null,
            totalPrice: item.totalPrice ?? null,
            priceOverride: item.priceOverride ?? false,
            attributes: (item.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
            notes: item.notes,
            files: {
              create: item.files.map((file) => ({
                fileName: file.fileName,
                fileUrl: file.fileUrl,
                pageCount: file.pageCount,
              })),
            },
          })),
        },
      },
      include: {
        items: {
          include: {
            files: true,
            category: { select: { id: true, name: true, slug: true } },
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Failed to create admin order:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 },
    );
  }
}
