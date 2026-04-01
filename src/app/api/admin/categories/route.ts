import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { createCategorySchema } from "@/lib/validations";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await prisma.productCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true, orderItems: true } } },
  });

  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validated = createCategorySchema.parse(body);

    const category = await prisma.productCategory.create({
      data: {
        name: validated.name,
        slug: validated.slug,
        description: validated.description,
        icon: validated.icon,
        attributeSchema: validated.attributeSchema,
        pricingModel: validated.pricingModel ?? "fixed",
        servicePriceDefault: validated.servicePriceDefault ?? null,
        dimensionsRequired: validated.dimensionsRequired ?? false,
        surcharges: validated.surcharges ? JSON.parse(JSON.stringify(validated.surcharges)) : undefined,
        sortOrder: validated.sortOrder ?? 0,
        isActive: validated.isActive ?? true,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "A category with this slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
