import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { importRoute, requireImportManager } from "@/lib/imports/importRoute";

/**
 * GET `?q=`: stock variants to link an import line to (SKU, supplier code or
 * name), plus the product categories for «Создать товар».
 */
export async function GET(request: NextRequest) {
  return importRoute("GET /api/admin/imports/variant-options", async () => {
    await requireImportManager();
    const q: string = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const variants = q
      ? await prisma.stockVariant.findMany({
          where: {
            OR: [
              { sku: { contains: q, mode: "insensitive" } },
              { supplierCode: { contains: q, mode: "insensitive" } },
              { label: { contains: q, mode: "insensitive" } },
              { item: { nameRu: { contains: q, mode: "insensitive" } } },
              { item: { nameRo: { contains: q, mode: "insensitive" } } },
            ],
          },
          take: 30,
          orderBy: [{ isActive: "desc" }, { sku: "asc" }],
          include: { item: { select: { nameRu: true, nameRo: true, category: { select: { nameRu: true } } } } },
        })
      : [];
    const categories = await prisma.stockCategory.findMany({
      where: { isActive: true, kind: "product" },
      orderBy: [{ sortOrder: "asc" }, { nameRu: "asc" }],
      select: { id: true, code: true, nameRu: true },
    });
    return NextResponse.json({
      variants: variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        supplierCode: v.supplierCode,
        name: v.item.nameRu || v.item.nameRo,
        label: v.label,
        categoryName: v.item.category.nameRu,
        isActive: v.isActive,
      })),
      categories,
    });
  });
}
