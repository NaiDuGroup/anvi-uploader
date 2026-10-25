import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStockManager, StockApiError, stockRoute } from "@/lib/stock/unified/apiRoute";
import { printerUpdateSchema } from "@/lib/stock/unified/printerAdmin";
import { loadPrinterJson } from "@/lib/stock/unified/printerAdminJson";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH: rename, (de)activate or reorder a printer. The code and technology stay fixed. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return stockRoute("PATCH /api/admin/stock/printers/[id]", async () => {
    await requireStockManager();
    const { id } = await params;
    const body = printerUpdateSchema.parse(await request.json());
    const exists = await prisma.printer.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new StockApiError(404, "not_found");
    await prisma.printer.update({
      where: { id },
      data: { name: body.name, isActive: body.isActive, sortOrder: body.sortOrder },
    });
    return NextResponse.json({ printer: await loadPrinterJson(prisma, id) });
  });
}
