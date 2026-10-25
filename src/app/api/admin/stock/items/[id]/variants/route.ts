import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStockVariantJson } from "@/lib/stock/unified/adminJson";
import {
  assertSkusFree,
  categoryUnit,
  requireStockManager,
  StockApiError,
  stockRoute,
} from "@/lib/stock/unified/apiRoute";
import { stockVariantInputSchema } from "@/lib/stock/unified/schemas";
import { variantCreateData } from "@/lib/stock/unified/variantWrite";

type Ctx = { params: Promise<{ id: string }> };

/** POST: add a variant (colour / size) to an existing item. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return stockRoute("POST /api/admin/stock/items/[id]/variants", async () => {
    await requireStockManager();
    const { id } = await params;
    const body = stockVariantInputSchema.parse(await request.json());
    const item = await prisma.stockItem.findUnique({
      where: { id },
      select: { id: true, category: { select: { unit: true } }, _count: { select: { variants: true } } },
    });
    if (!item) throw new StockApiError(404, "not_found");
    const data = variantCreateData(body, categoryUnit(item.category.unit), item._count.variants);
    await assertSkusFree({ variantSkus: [body.sku] });
    const variant = await prisma.stockVariant.create({ data: { ...data, itemId: id } });
    return NextResponse.json({ variant: toStockVariantJson(variant) }, { status: 201 });
  });
}
