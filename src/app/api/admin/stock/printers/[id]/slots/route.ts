import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStockManager, StockApiError, stockRoute } from "@/lib/stock/unified/apiRoute";
import { printerSlotCreateSchema } from "@/lib/stock/unified/printerAdmin";
import { loadPrinterJson } from "@/lib/stock/unified/printerAdminJson";
import {
  assertFieldsFitRole,
  assertSlotLabelFree,
  assertVariantFitsRole,
  sharePatch,
} from "@/lib/stock/unified/printerSlotWrite";

type Ctx = { params: Promise<{ id: string }> };

/** POST: add a colour / consumable slot to a printer. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return stockRoute("POST /api/admin/stock/printers/[id]/slots", async () => {
    await requireStockManager();
    const { id } = await params;
    const body = printerSlotCreateSchema.parse(await request.json());
    const printer = await prisma.printer.findUnique({
      where: { id },
      select: { id: true, slots: { select: { sortOrder: true } } },
    });
    if (!printer) throw new StockApiError(404, "not_found");
    assertFieldsFitRole(body.role, body);
    await assertSlotLabelFree(prisma, id, body.label);
    if (body.variantId) await assertVariantFitsRole(prisma, body.variantId, body.role);
    const nextSort: number = printer.slots.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 1;
    await prisma.printerSlot.create({
      data: {
        printerId: id,
        label: body.label,
        role: body.role,
        variantId: body.variantId ?? null,
        share: sharePatch(body.share) ?? null,
        sheetsPerUnit: body.sheetsPerUnit ?? null,
        sortOrder: body.sortOrder ?? nextSort,
      },
    });
    return NextResponse.json({ printer: await loadPrinterJson(prisma, id) }, { status: 201 });
  });
}
