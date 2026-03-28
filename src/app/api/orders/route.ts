import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrderSchema } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";
import { nanoid } from "nanoid";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const where =
      user.role === "workshop" ? { isWorkshop: true } : undefined;

    const orders = await prisma.order.findMany({
      where,
      include: { files: true },
      orderBy: { createdAt: "desc" },
    });

    // Resolve assigned user names
    const assignedIds = [...new Set(orders.map((o) => o.assignedTo).filter(Boolean))] as string[];
    const usersMap = new Map<string, string>();
    if (assignedIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: assignedIds } },
        select: { id: true, name: true },
      });
      users.forEach((u) => usersMap.set(u.id, u.name));
    }

    const enriched = orders.map((o) => ({
      ...o,
      assignedToName: o.assignedTo ? usersMap.get(o.assignedTo) ?? null : null,
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Failed to fetch orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createOrderSchema.parse(body);

    const order = await prisma.order.create({
      data: {
        phone: validated.phone,
        notes: validated.notes,
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        files: {
          create: validated.files.map((file) => ({
            fileName: file.fileName,
            fileUrl: file.fileUrl,
            copies: file.copies,
            color: file.color,
            paperType: file.paperType,
          })),
        },
      },
      include: { files: true },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Failed to create order:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
