import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrderSchema } from "@/lib/validations";
import type { OrderStatus } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";
import { fetchOrdersData } from "@/lib/fetchOrders";
import { nanoid } from "nanoid";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusesParam = searchParams.get("statuses")?.trim() ?? "";

    const result = await fetchOrdersData(user, {
      page: parseInt(searchParams.get("page") ?? "1", 10) || 1,
      limit: parseInt(searchParams.get("limit") ?? "30", 10) || 30,
      search: searchParams.get("search") ?? "",
      onlyMine: searchParams.get("onlyMine") === "true",
      hideDelivered: searchParams.get("hideDelivered") === "true",
      statuses: statusesParam ? statusesParam.split(",") as OrderStatus[] : [],
      dateFrom: searchParams.get("dateFrom") ?? "",
      dateTo: searchParams.get("dateTo") ?? "",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 },
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
            pageCount: file.pageCount,
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
