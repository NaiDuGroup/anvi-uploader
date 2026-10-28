import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { ImportApiError, importCostSchema, importRoute, requireImportManager } from "@/lib/imports/importRoute";

type Ctx = { params: Promise<{ id: string; costId: string }> };

async function ownCost(id: string, costId: string): Promise<void> {
  const c = await prisma.importCost.findUnique({ where: { id: costId }, select: { importId: true } });
  if (!c || c.importId !== id) throw new ImportApiError(404, "not_found");
}

/** PATCH: change a cost. A posted import keeps its old costs until posted again («Пересчитать»). */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return importRoute("PATCH /api/admin/imports/[id]/costs/[costId]", async () => {
    await requireImportManager();
    const { id, costId } = await params;
    await ownCost(id, costId);
    const b = importCostSchema.partial().parse(await request.json());
    await prisma.importCost.update({
      where: { id: costId },
      data: {
        kind: b.kind,
        amountMdl: b.amountMdl === undefined ? undefined : new Prisma.Decimal(b.amountMdl.toFixed(2)),
        isProvisional: b.isProvisional,
        excluded: b.excluded,
        note: b.note === undefined ? undefined : b.note || null,
      },
    });
    return NextResponse.json(await loadImportDetail(prisma, id));
  });
}

export async function DELETE(_r: NextRequest, { params }: Ctx) {
  return importRoute("DELETE /api/admin/imports/[id]/costs/[costId]", async () => {
    await requireImportManager();
    const { id, costId } = await params;
    await ownCost(id, costId);
    await prisma.importCost.delete({ where: { id: costId } });
    return NextResponse.json(await loadImportDetail(prisma, id));
  });
}
