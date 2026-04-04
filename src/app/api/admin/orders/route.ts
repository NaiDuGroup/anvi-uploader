import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminOrderSchema } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";
import { nanoid } from "nanoid";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";

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

    let clientId: string | null | undefined = validated.clientId ?? undefined;
    let phoneForOrder = validated.phone;
    let clientNameForOrder: string | null | undefined = validated.clientName;

    if (clientId) {
      const c = await prisma.studioCustomer.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          kind: true,
          phone: true,
          personName: true,
          companyName: true,
        },
      });
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
      phoneForOrder = oc.phone;
      clientNameForOrder = oc.clientName ?? undefined;
    } else {
      const linked = await findClientIdByOrderPhone(validated.phone);
      if (linked) clientId = linked;
    }

    const order = await prisma.order.create({
      data: {
        phone: phoneForOrder,
        clientName: clientNameForOrder,
        clientId: clientId ?? undefined,
        notes: validated.notes,
        price: validated.price ?? undefined,
        status: "SENT_TO_WORKSHOP",
        isWorkshop: true,
        createdBy: user.id,
        sentToWorkshopBy: user.id,
        assignedTo: user.id,
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        files: {
          create: validated.files.map((file) => ({
            fileName: file.fileName,
            fileUrl: file.fileUrl,
            copies: file.copies,
            color: file.color,
            paperType: file.paperType,
            pageCount: file.pageCount,
          })),
        },
      },
      include: { files: true },
    });

    await prisma.orderLog.create({
      data: {
        orderId: order.id,
        userId: user.id,
        action: "order_created",
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
