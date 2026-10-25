import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STOCK_USER_NAME_SELECT, toStockReceiptJson } from "@/lib/stock/unified/adminJson";
import { requireStockManager, StockApiError, stockRoute } from "@/lib/stock/unified/apiRoute";

type Ctx = { params: Promise<{ id: string }> };

/** GET: the variant's receipts, newest purchase first (for review / reversal). */
export async function GET(_request: NextRequest, { params }: Ctx) {
  return stockRoute("GET /api/admin/stock/variants/[id]/receipts", async () => {
    await requireStockManager();
    const { id } = await params;
    const exists = await prisma.stockVariant.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new StockApiError(404, "not_found");
    const rows = await prisma.stockReceipt.findMany({
      where: { variantId: id },
      orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { variant: { select: { sku: true, label: true } }, createdBy: STOCK_USER_NAME_SELECT },
    });
    return NextResponse.json({ receipts: rows.map(toStockReceiptJson) });
  });
}
