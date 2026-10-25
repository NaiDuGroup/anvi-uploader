import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STOCK_USER_NAME_SELECT, toStockMovementJson } from "@/lib/stock/unified/adminJson";
import type { StockMovementsPage } from "@/lib/stock/unified/adminTypes";
import { requireStockManager, StockApiError, stockRoute } from "@/lib/stock/unified/apiRoute";
import { stockMovementsQuerySchema } from "@/lib/stock/unified/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** GET `?page=1&pageSize=50`: movement history, newest first. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return stockRoute("GET /api/admin/stock/variants/[id]/movements", async () => {
    await requireStockManager();
    const { id } = await params;
    const sp = request.nextUrl.searchParams;
    const { page, pageSize } = stockMovementsQuerySchema.parse({
      page: sp.get("page") ?? undefined,
      pageSize: sp.get("pageSize") ?? undefined,
    });
    const exists = await prisma.stockVariant.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new StockApiError(404, "not_found");
    const [total, rows] = await Promise.all([
      prisma.stockMovement.count({ where: { variantId: id } }),
      prisma.stockMovement.findMany({
        where: { variantId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { createdBy: STOCK_USER_NAME_SELECT },
      }),
    ]);
    const body: StockMovementsPage = { movements: rows.map(toStockMovementJson), total, page, pageSize };
    return NextResponse.json(body);
  });
}
