import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reverseReceipt } from "@/lib/stock/unified/ledger";
import { requireStockManager, StockApiError, stockRoute } from "@/lib/stock/unified/apiRoute";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE: cancel a receipt entered by mistake (ledger takes the units and value
 * back out). Refused with 409 `insufficient_stock` when part of it was already
 * used, and for receipts posted from e-Factura (undo those from the invoice).
 */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  return stockRoute("DELETE /api/admin/stock/receipts/[id]", async () => {
    const user = await requireStockManager();
    const { id } = await params;
    const receipt = await prisma.stockReceipt.findUnique({
      where: { id },
      select: { id: true, purchaseInvoiceLineId: true },
    });
    if (!receipt) throw new StockApiError(404, "not_found");
    if (receipt.purchaseInvoiceLineId) throw new StockApiError(409, "receipt_from_invoice");
    await prisma.$transaction((tx) => reverseReceipt(tx, { receiptId: id, createdById: user.id }));
    return NextResponse.json({ ok: true });
  });
}
