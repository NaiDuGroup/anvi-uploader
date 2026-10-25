import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStockCategoryJson } from "@/lib/stock/unified/adminJson";
import { requireStockManager, StockApiError, stockRoute } from "@/lib/stock/unified/apiRoute";
import { stockCategoryUpdateSchema } from "@/lib/stock/unified/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Update names / kind / order / active / print methods; the unit only while the category has no items. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return stockRoute("PATCH /api/admin/stock/categories/[id]", async () => {
    await requireStockManager();
    const { id } = await params;
    const body = stockCategoryUpdateSchema.parse(await request.json());
    const current = await prisma.stockCategory.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!current) throw new StockApiError(404, "not_found");
    if (body.unit !== undefined && body.unit !== current.unit && current._count.items > 0) {
      throw new StockApiError(409, "unit_locked");
    }
    const row = await prisma.stockCategory.update({
      where: { id },
      data: {
        kind: body.kind,
        nameRo: body.nameRo,
        nameRu: body.nameRu,
        nameEn: body.nameEn,
        unit: body.unit,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
        printMethods: body.printMethods,
      },
    });
    return NextResponse.json({ category: toStockCategoryJson(row, current._count.items) });
  });
}
