import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadImportDetail, matchVariantsByCode } from "@/lib/imports/importQueries";
import { ImportApiError, importRoute, requireImportManager } from "@/lib/imports/importRoute";

const lineSchema = z.object({
  supplierCode: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  quantity: z.number().positive().max(10_000_000),
  unitPrice: z.number().min(0).max(10_000_000),
  amount: z.number().min(0).max(100_000_000),
});

const schema = z.object({
  lines: z.array(lineSchema).min(1).max(1000),
  /** true: replace all lines; false: append after the existing ones. */
  replace: z.boolean().default(false),
});

/**
 * POST: enter item lines by hand — for a supplier document the PDF reader
 * cannot read (a scan, another layout). Known codes are matched like
 * «Взять строки».
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("POST /api/admin/imports/[id]/lines", async () => {
    await requireImportManager();
    const { id } = await params;
    const b = schema.parse(await request.json());
    const s = await prisma.importShipment.findUnique({ where: { id }, select: { postedMode: true } });
    if (!s) throw new ImportApiError(404, "not_found");
    if (s.postedMode) throw new ImportApiError(409, "import_posted");

    const matches = await matchVariantsByCode(prisma, b.lines.map((l) => l.supplierCode));
    await prisma.$transaction(async (tx) => {
      if (b.replace) await tx.importLine.deleteMany({ where: { importId: id } });
      const last = b.replace
        ? null
        : await tx.importLine.findFirst({ where: { importId: id }, orderBy: { position: "desc" }, select: { position: true } });
      const start: number = last?.position ?? 0;
      await tx.importLine.createMany({
        data: b.lines.map((l, i) => ({
          importId: id,
          position: start + i + 1,
          supplierCode: l.supplierCode.toUpperCase(),
          description: l.description,
          quantity: new Prisma.Decimal(l.quantity),
          unitPrice: new Prisma.Decimal(l.unitPrice.toFixed(4)),
          amount: new Prisma.Decimal(l.amount.toFixed(2)),
          variantId: matches.get(l.supplierCode.toUpperCase()) ?? null,
        })),
      });
    });
    return NextResponse.json(await loadImportDetail(prisma, id), { status: 201 });
  });
}
