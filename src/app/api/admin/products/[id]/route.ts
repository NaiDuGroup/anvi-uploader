import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { updateProductSchema } from "@/lib/validations";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const validated = updateProductSchema.parse(body);

    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (validated.categoryId !== undefined) data.categoryId = validated.categoryId;
    if (validated.name !== undefined) data.name = validated.name;
    if (validated.sku !== undefined) data.sku = validated.sku;
    if (validated.description !== undefined) data.description = validated.description;
    if (validated.imageUrl !== undefined) data.imageUrl = validated.imageUrl;
    if (validated.attributes !== undefined) data.attributes = validated.attributes as Prisma.InputJsonValue;
    if (validated.costPrice !== undefined) data.costPrice = validated.costPrice;
    if (validated.sellingPrice !== undefined) data.sellingPrice = validated.sellingPrice;
    if (validated.priceTiers !== undefined) data.priceTiers = validated.priceTiers ? JSON.parse(JSON.stringify(validated.priceTiers)) : null;
    if (validated.minQuantity !== undefined) data.minQuantity = validated.minQuantity;
    if (validated.leadTimeDays !== undefined) data.leadTimeDays = validated.leadTimeDays;
    if (validated.isActive !== undefined) data.isActive = validated.isActive;

    const product = await prisma.product.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json(product);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg.includes("Record to update not found")) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "A product with this SKU already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const hasOrders = await prisma.orderItem.count({ where: { productId: id } });
  if (hasOrders > 0) {
    return NextResponse.json(
      { error: "Cannot delete product with existing orders" },
      { status: 409 },
    );
  }

  try {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
