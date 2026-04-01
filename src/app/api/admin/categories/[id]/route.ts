import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { updateCategorySchema } from "@/lib/validations";

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
    const validated = updateCategorySchema.parse(body);

    const data: Record<string, unknown> = {};
    if (validated.name !== undefined) data.name = validated.name;
    if (validated.slug !== undefined) data.slug = validated.slug;
    if (validated.description !== undefined) data.description = validated.description;
    if (validated.icon !== undefined) data.icon = validated.icon;
    if (validated.attributeSchema !== undefined) data.attributeSchema = JSON.parse(JSON.stringify(validated.attributeSchema));
    if (validated.pricingModel !== undefined) data.pricingModel = validated.pricingModel;
    if (validated.servicePriceDefault !== undefined) data.servicePriceDefault = validated.servicePriceDefault;
    if (validated.dimensionsRequired !== undefined) data.dimensionsRequired = validated.dimensionsRequired;
    if (validated.surcharges !== undefined) data.surcharges = validated.surcharges ? JSON.parse(JSON.stringify(validated.surcharges)) : null;
    if (validated.sortOrder !== undefined) data.sortOrder = validated.sortOrder;
    if (validated.isActive !== undefined) data.isActive = validated.isActive;

    const category = await prisma.productCategory.update({
      where: { id },
      data,
    });

    return NextResponse.json(category);
  } catch (error) {
    console.error("Failed to update category:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg.includes("Record to update not found")) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "A category with this slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
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

  const hasOrders = await prisma.orderItem.count({ where: { categoryId: id } });
  if (hasOrders > 0) {
    return NextResponse.json(
      { error: "Cannot delete category with existing orders" },
      { status: 409 },
    );
  }

  try {
    await prisma.product.deleteMany({ where: { categoryId: id } });
    await prisma.productCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
