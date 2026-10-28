import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listImports } from "@/lib/imports/importQueries";
import { importHeaderSchema, importRoute, requireImportManager, toDateOnly } from "@/lib/imports/importRoute";

/** GET: every import, newest first. */
export async function GET() {
  return importRoute("GET /api/admin/imports", async () => {
    await requireImportManager();
    return NextResponse.json({ imports: await listImports(prisma) });
  });
}

/** POST: new import (header only). */
export async function POST(request: NextRequest) {
  return importRoute("POST /api/admin/imports", async () => {
    const user = await requireImportManager();
    const b = importHeaderSchema.parse(await request.json());
    const row = await prisma.importShipment.create({
      data: {
        supplierName: b.supplierName,
        supplierOrderNo: b.supplierOrderNo || null,
        proformaNo: b.proformaNo || null,
        brokerName: b.brokerName || null,
        declarationNo: b.declarationNo || null,
        trackingNo: b.trackingNo || null,
        currency: b.currency ?? "EUR",
        orderedAt: toDateOnly(b.orderedAt) ?? null,
        arrivedAt: toDateOnly(b.arrivedAt) ?? null,
        status: b.status && b.status !== "posted" ? b.status : "ordered",
        notes: b.notes || null,
        relatedImportId: b.relatedImportId ?? null,
        createdById: user.id,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: row.id }, { status: 201 });
  });
}
