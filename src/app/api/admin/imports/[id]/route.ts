import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { ImportApiError, importPatchSchema, importRoute, requireImportManager, toDateOnly } from "@/lib/imports/importRoute";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_r: NextRequest, { params }: Ctx) {
  return importRoute("GET /api/admin/imports/[id]", async () => {
    await requireImportManager();
    const detail = await loadImportDetail(prisma, (await params).id);
    if (!detail) throw new ImportApiError(404, "not_found");
    return NextResponse.json(detail);
  });
}

/** PATCH: header fields, status, nuances. «posted» status is set only by posting. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return importRoute("PATCH /api/admin/imports/[id]", async () => {
    await requireImportManager();
    const { id } = await params;
    const b = importPatchSchema.parse(await request.json());
    const current = await prisma.importShipment.findUnique({ where: { id }, select: { postedMode: true } });
    if (!current) throw new ImportApiError(404, "not_found");
    if (b.status === "posted" || (current.postedMode && b.status !== undefined)) {
      throw new ImportApiError(409, "import_status_by_posting");
    }
    if (b.relatedImportId === id) throw new ImportApiError(400, "import_related_self");
    const opt = (v: string | null | undefined) => (v === undefined ? undefined : v || null);
    await prisma.importShipment.update({
      where: { id },
      data: {
        supplierName: b.supplierName,
        supplierOrderNo: opt(b.supplierOrderNo),
        proformaNo: opt(b.proformaNo),
        brokerName: opt(b.brokerName),
        declarationNo: opt(b.declarationNo),
        trackingNo: opt(b.trackingNo),
        currency: b.currency,
        orderedAt: toDateOnly(b.orderedAt),
        arrivedAt: toDateOnly(b.arrivedAt),
        status: b.status,
        notes: b.notes === undefined ? undefined : b.notes || null,
        relatedImportId: b.relatedImportId,
      },
    });
    return NextResponse.json(await loadImportDetail(prisma, id));
  });
}

/** DELETE: only an import that is not posted (its files stay in storage). */
export async function DELETE(_r: NextRequest, { params }: Ctx) {
  return importRoute("DELETE /api/admin/imports/[id]", async () => {
    await requireImportManager();
    const { id } = await params;
    const s = await prisma.importShipment.findUnique({ where: { id }, select: { postedMode: true } });
    if (!s) throw new ImportApiError(404, "not_found");
    if (s.postedMode) throw new ImportApiError(409, "import_posted");
    await prisma.importShipment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
