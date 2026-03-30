import { NextRequest, NextResponse } from "next/server";
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

    const order = await prisma.order.create({
      data: {
        phone: validated.phone,
        clientName: validated.clientName,
        notes: validated.notes,
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
