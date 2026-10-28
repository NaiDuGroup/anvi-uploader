import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { ImportApiError, importCostSchema, importRoute, requireImportManager } from "@/lib/imports/importRoute";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("POST /api/admin/imports/[id]/costs", async () => {
    await requireImportManager();
    const { id } = await params;
    const b = importCostSchema.parse(await request.json());
    const exists = await prisma.importShipment.count({ where: { id } });
    if (!exists) throw new ImportApiError(404, "not_found");
    const count = await prisma.importCost.count({ where: { importId: id } });
    await prisma.importCost.create({
      data: {
        importId: id,
        kind: b.kind,
        amountMdl: new Prisma.Decimal(b.amountMdl.toFixed(2)),
        isProvisional: b.isProvisional ?? false,
        excluded: b.excluded ?? false,
        note: b.note || null,
        sortOrder: count,
      },
    });
    return NextResponse.json(await loadImportDetail(prisma, id), { status: 201 });
  });
}
