import type { Prisma, PrismaClient } from "@prisma/client";
import { missingImportDocuments } from "./constants";
import { computeImportCosting } from "./landedCost";
import { gorFactoryImageUrl } from "./gorFactory";
import type { ImportDetailJson, ImportListItemJson } from "./dto";

type Db = PrismaClient | Prisma.TransactionClient;

const num = (d: { toString(): string } | null | undefined): number => (d == null ? 0 : Number(d.toString()));
const numOrNull = (d: { toString(): string } | null | undefined): number | null => (d == null ? null : Number(d.toString()));
const day = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function importLabel(i: { supplierName: string; supplierOrderNo: string | null; proformaNo: string | null }): string {
  return [i.supplierOrderNo ?? i.proformaNo, i.supplierName].filter(Boolean).join(" · ");
}

export async function listImports(db: Db): Promise<ImportListItemJson[]> {
  const rows = await db.importShipment.findMany({
    orderBy: [{ orderedAt: "desc" }, { createdAt: "desc" }],
    include: {
      documents: { select: { kind: true } },
      costs: { select: { kind: true, amountMdl: true, excluded: true, isProvisional: true } },
      lines: { select: { id: true, quantity: true, amount: true } },
    },
  });
  return rows.map((r) => {
    const costing = computeImportCosting(
      r.lines.map((l) => ({ id: l.id, quantity: num(l.quantity), amount: num(l.amount) })),
      r.costs.map((c) => ({ kind: c.kind, amountMdl: num(c.amountMdl), excluded: c.excluded, isProvisional: c.isProvisional })),
    );
    return {
      id: r.id,
      supplierName: r.supplierName,
      supplierOrderNo: r.supplierOrderNo,
      proformaNo: r.proformaNo,
      orderedAt: day(r.orderedAt),
      status: r.status,
      postedMode: r.postedMode,
      currency: r.currency,
      goodsAmount: costing.goodsAmount,
      totalCostsMdl: costing.totalCostsMdl,
      linesCount: r.lines.length,
      piecesCount: r.lines.reduce((s, l) => s + num(l.quantity), 0),
      missingDocuments: missingImportDocuments(r.documents.map((d) => d.kind)),
      provisional: costing.provisional,
    };
  });
}

export const IMPORT_DETAIL_INCLUDE = {
  relatedImport: { select: { id: true, supplierName: true, supplierOrderNo: true, proformaNo: true } },
  documents: { orderBy: { createdAt: "asc" } },
  costs: { orderBy: [{ sortOrder: "asc" }] },
  lines: {
    orderBy: { position: "asc" },
    include: {
      variant: {
        include: { item: { select: { nameRu: true, nameRo: true, imageUrl: true, category: { select: { nameRu: true } } } } },
      },
    },
  },
} satisfies Prisma.ImportShipmentInclude;

export async function loadImportDetail(db: Db, id: string): Promise<ImportDetailJson | null> {
  const r = await db.importShipment.findUnique({ where: { id }, include: IMPORT_DETAIL_INCLUDE });
  if (!r) return null;
  const lines = r.lines.map((l) => ({ id: l.id, quantity: num(l.quantity), amount: num(l.amount) }));
  const costs = r.costs.map((c) => ({
    id: c.id,
    kind: c.kind,
    amountMdl: num(c.amountMdl),
    isProvisional: c.isProvisional,
    excluded: c.excluded,
    note: c.note,
  }));
  return {
    id: r.id,
    supplierName: r.supplierName,
    supplierOrderNo: r.supplierOrderNo,
    proformaNo: r.proformaNo,
    brokerName: r.brokerName,
    declarationNo: r.declarationNo,
    trackingNo: r.trackingNo,
    currency: r.currency,
    orderedAt: day(r.orderedAt),
    arrivedAt: day(r.arrivedAt),
    status: r.status,
    notes: r.notes,
    relatedImport: r.relatedImport ? { id: r.relatedImport.id, label: importLabel(r.relatedImport) } : null,
    postedMode: r.postedMode,
    postedAt: r.postedAt ? r.postedAt.toISOString() : null,
    documents: r.documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      fileName: d.fileName,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      note: d.note,
      createdAt: d.createdAt.toISOString(),
    })),
    costs,
    lines: r.lines.map((l) => ({
      id: l.id,
      position: l.position,
      supplierCode: l.supplierCode,
      description: l.description,
      quantity: num(l.quantity),
      unitPrice: num(l.unitPrice),
      amount: num(l.amount),
      skip: l.skip,
      variant: l.variant
        ? {
            id: l.variant.id,
            sku: l.variant.sku,
            name: l.variant.item.nameRu || l.variant.item.nameRo,
            label: l.variant.label,
            categoryName: l.variant.item.category.nameRu,
            imageUrl: l.variant.item.imageUrl,
            stockQuantity: num(l.variant.stockQuantity),
            unitCostMdl: numOrNull(l.variant.avgCost) ?? numOrNull(l.variant.purchaseCost),
          }
        : null,
      receiptId: l.receiptId,
      postedUnitCostMdl: numOrNull(l.postedUnitCostMdl),
      supplierImageUrl: gorFactoryImageUrl(l.supplierCode),
    })),
    costing: computeImportCosting(lines, costs),
    missingDocuments: missingImportDocuments(r.documents.map((d) => d.kind)),
  };
}

/** Variant id per supplier code: `supplierCode`, else a variant whose SKU is the code. */
export async function matchVariantsByCode(db: Db, codes: readonly string[]): Promise<Map<string, string>> {
  const upper: string[] = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (upper.length === 0) return new Map();
  const rows = await db.stockVariant.findMany({
    where: { OR: [{ supplierCode: { in: upper } }, { sku: { in: upper } }] },
    select: { id: true, sku: true, supplierCode: true, isActive: true },
    orderBy: { isActive: "desc" },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.supplierCode && !out.has(r.supplierCode.toUpperCase())) out.set(r.supplierCode.toUpperCase(), r.id);
  }
  for (const r of rows) {
    const k = r.sku.toUpperCase();
    if (upper.includes(k) && !out.has(k)) out.set(k, r.id);
  }
  return out;
}
