import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gorFactoryImageUrl } from "@/lib/imports/gorFactory";
import { proposeImportItems } from "@/lib/imports/gorFactoryProposals";
import { ImportApiError, importRoute, requireImportManager } from "@/lib/imports/importRoute";
import type { ImportProposalsJson } from "@/lib/imports/dto";
import { parsePrintMethods } from "@/lib/stock/unified/printMethods";

/** GET: «Разобрать по моделям» — proposed stock items for the lines not linked yet. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("GET /api/admin/imports/[id]/proposals", async () => {
    await requireImportManager();
    const { id } = await params;
    const shipment = await prisma.importShipment.findUnique({ where: { id }, select: { id: true } });
    if (!shipment) throw new ImportApiError(404, "not_found");
    const [lines, categories] = await Promise.all([
      prisma.importLine.findMany({
        where: { importId: id, variantId: null, skip: false, receiptId: null },
        orderBy: { position: "asc" },
        select: { id: true, supplierCode: true, description: true, quantity: true },
      }),
      prisma.stockCategory.findMany({
        where: { kind: "product", isActive: true },
        orderBy: [{ sortOrder: "asc" }, { nameRu: "asc" }],
        select: { id: true, code: true, nameRu: true, nameRo: true, nameEn: true, printMethods: true },
      }),
    ]);
    const quantityByLine = new Map(lines.map((l) => [l.id, Number(l.quantity)]));
    const body: ImportProposalsJson = {
      categories: categories.map((c) => ({ ...c, printMethods: parsePrintMethods(c.printMethods) })),
      proposals: proposeImportItems(lines, categories).map((p) => ({
        ...p,
        photoUrl: gorFactoryImageUrl(p.photoCode),
        quantity: p.variants.reduce((s, v) => s + (quantityByLine.get(v.lineId) ?? 0), 0),
      })),
    };
    return NextResponse.json(body);
  });
}
