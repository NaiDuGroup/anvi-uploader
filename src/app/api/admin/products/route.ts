import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { createProductSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categoryId = request.nextUrl.searchParams.get("categoryId");

  const products = await prisma.product.findMany({
    where: categoryId ? { categoryId } : undefined,
    orderBy: { name: "asc" },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      _count: { select: { orderItems: true } },
    },
  });

  return NextResponse.json(products);
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validated = createProductSchema.parse(body);

    const product = await prisma.product.create({
      data: {
        categoryId: validated.categoryId,
        name: validated.name,
        sku: validated.sku,
        description: validated.description,
        imageUrl: validated.imageUrl,
        attributes: (validated.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
        costPrice: validated.costPrice ?? null,
        sellingPrice: validated.sellingPrice ?? null,
        priceTiers: validated.priceTiers ? JSON.parse(JSON.stringify(validated.priceTiers)) : null,
        minQuantity: validated.minQuantity ?? null,
        leadTimeDays: validated.leadTimeDays ?? null,
        isActive: validated.isActive ?? true,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "A product with this SKU already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
