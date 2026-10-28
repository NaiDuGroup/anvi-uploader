import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  STOCK_VARIANTS_ORDER,
  toStockCategoryJson,
  toStockItemJson,
} from "@/lib/stock/unified/adminJson";
import {
  assertSkusFree,
  categoryUnit,
  requireStockManager,
  StockApiError,
  stockRoute,
} from "@/lib/stock/unified/apiRoute";
import { stockItemCreateSchema } from "@/lib/stock/unified/schemas";
import { variantCreateData } from "@/lib/stock/unified/variantWrite";

/** GET `?category=<code>`: the category plus its items with variants and totals. */
export async function GET(request: NextRequest) {
  return stockRoute("GET /api/admin/stock/items", async () => {
    await requireStockManager();
    const code: string = request.nextUrl.searchParams.get("category")?.trim() ?? "";
    if (!code) throw new StockApiError(400, "category_required");
    const category = await prisma.stockCategory.findUnique({
      where: { code },
      include: { _count: { select: { items: true } } },
    });
    if (!category) throw new StockApiError(404, "category_not_found");
    const items = await prisma.stockItem.findMany({
      where: { categoryId: category.id },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      include: { variants: { orderBy: STOCK_VARIANTS_ORDER } },
    });
    return NextResponse.json({
      category: toStockCategoryJson(category, category._count.items),
      items: items.map(toStockItemJson),
    });
  });
}

/** POST: create an item together with its variants. */
export async function POST(request: NextRequest) {
  return stockRoute("POST /api/admin/stock/items", async () => {
    await requireStockManager();
    const body = stockItemCreateSchema.parse(await request.json());
    const category = await prisma.stockCategory.findUnique({
      where: { id: body.categoryId },
      select: { id: true, unit: true },
    });
    if (!category) throw new StockApiError(404, "category_not_found");
    const unit = categoryUnit(category.unit);
    const variants = body.variants.map((v, i) =>
      variantCreateData(v.priceTiers === undefined ? { ...v, priceTiers: body.priceTiers } : v, unit, i),
    );
    await assertSkusFree({ itemSkus: [body.sku], variantSkus: body.variants.map((v) => v.sku) });

    const item = await prisma.stockItem.create({
      data: {
        categoryId: category.id,
        sku: body.sku,
        nameRo: body.nameRo,
        nameRu: body.nameRu,
        nameEn: body.nameEn,
        imageUrl: body.imageUrl?.trim() || null,
        internalNotes: body.internalNotes?.trim() || null,
        isActive: body.isActive ?? true,
        isSellable: body.isSellable ?? false,
        sortOrder: body.sortOrder ?? 0,
        attributes: (body.attributes ?? {}) as object,
        printMethods: body.printMethods ?? [],
        variants: { create: variants },
      },
      include: { variants: { orderBy: STOCK_VARIANTS_ORDER } },
    });
    return NextResponse.json({ item: toStockItemJson(item) }, { status: 201 });
  });
}
