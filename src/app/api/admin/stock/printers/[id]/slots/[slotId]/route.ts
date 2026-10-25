import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStockManager, StockApiError, stockRoute } from "@/lib/stock/unified/apiRoute";
import { isPrinterSlotRole, printerSlotUpdateSchema } from "@/lib/stock/unified/printerAdmin";
import { loadPrinterJson } from "@/lib/stock/unified/printerAdminJson";
import {
  assertFieldsFitRole,
  assertSlotLabelFree,
  assertVariantFitsRole,
  sharePatch,
} from "@/lib/stock/unified/printerSlotWrite";

type Ctx = { params: Promise<{ id: string; slotId: string }> };

async function findSlot(printerId: string, slotId: string) {
  const slot = await prisma.printerSlot.findFirst({
    where: { id: slotId, printerId },
    select: { id: true, role: true },
  });
  if (!slot || !isPrinterSlotRole(slot.role)) throw new StockApiError(404, "not_found");
  return { id: slot.id, role: slot.role };
}

/** PATCH: label, loaded variant (from the role's category), ink share, toner yield, order. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return stockRoute("PATCH /api/admin/stock/printers/[id]/slots/[slotId]", async () => {
    await requireStockManager();
    const { id, slotId } = await params;
    const body = printerSlotUpdateSchema.parse(await request.json());
    const slot = await findSlot(id, slotId);
    assertFieldsFitRole(slot.role, body);
    if (body.label !== undefined) await assertSlotLabelFree(prisma, id, body.label, slot.id);
    if (body.variantId) await assertVariantFitsRole(prisma, body.variantId, slot.role);
    await prisma.printerSlot.update({
      where: { id: slot.id },
      data: {
        label: body.label,
        variantId: body.variantId,
        share: sharePatch(body.share),
        sheetsPerUnit: body.sheetsPerUnit,
        sortOrder: body.sortOrder,
      },
    });
    return NextResponse.json({ printer: await loadPrinterJson(prisma, id) });
  });
}

/** DELETE: remove a slot. Stock items and their history stay untouched. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  return stockRoute("DELETE /api/admin/stock/printers/[id]/slots/[slotId]", async () => {
    await requireStockManager();
    const { id, slotId } = await params;
    const slot = await findSlot(id, slotId);
    await prisma.printerSlot.delete({ where: { id: slot.id } });
    return NextResponse.json({ printer: await loadPrinterJson(prisma, id) });
  });
}
