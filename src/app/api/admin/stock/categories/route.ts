import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStockCategoryJson } from "@/lib/stock/unified/adminJson";
import { requireStockManager, StockApiError, stockRoute } from "@/lib/stock/unified/apiRoute";
import { stockCategoryCreateSchema } from "@/lib/stock/unified/schemas";

/** GET: categories with item counts (`?active=1` → only active, for the Склад hub). POST: create. */
export async function GET(request: NextRequest) {
  return stockRoute("GET /api/admin/stock/categories", async () => {
    await requireStockManager();
    const activeOnly: boolean = request.nextUrl.searchParams.get("active") === "1";
    const rows = await prisma.stockCategory.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { items: activeOnly ? { where: { isActive: true } } : true } } },
    });
    return NextResponse.json({
      categories: rows.map((r) => toStockCategoryJson(r, r._count.items)),
    });
  });
}

export async function POST(request: NextRequest) {
  return stockRoute("POST /api/admin/stock/categories", async () => {
    await requireStockManager();
    const body = stockCategoryCreateSchema.parse(await request.json());
    const exists = await prisma.stockCategory.findUnique({ where: { code: body.code }, select: { id: true } });
    if (exists) throw new StockApiError(409, "code_taken");
    const row = await prisma.stockCategory.create({
      data: {
        code: body.code,
        kind: body.kind,
        nameRo: body.nameRo,
        nameRu: body.nameRu,
        nameEn: body.nameEn,
        unit: body.unit,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
        printMethods: body.printMethods ?? [],
      },
    });
    return NextResponse.json({ category: toStockCategoryJson(row, 0) }, { status: 201 });
  });
}
