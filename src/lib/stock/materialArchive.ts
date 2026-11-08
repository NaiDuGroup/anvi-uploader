import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Rolls (`LargeFormatMaterial`) and sheet papers (`SheetPaper`) are archived, not deleted:
 * `isActive = false` hides them from the order wizard, shop and price lists while orders and
 * stock history keep pointing at the row. A hard delete is allowed only for a row that never
 * had any history (otherwise Cascade / SetNull would erase receipts, write-offs and order links).
 */

/** API error code of a refused hard delete (the client shows «в архив» advice). */
export const MATERIAL_HAS_HISTORY_ERROR = "has_history";

/** Row counts referencing a roll / paper, its unified stock variant or its supplier mapping. */
export type MaterialHistoryCounts = Record<string, number>;

/** Pure guard: any referencing row means the item has history and must be archived instead. */
export function hasMaterialHistory(counts: MaterialHistoryCounts): boolean {
  return Object.values(counts).some((n) => n > 0);
}

/** Rows shown in the catalog list: archived (`isActive = false`) ones only when asked for. */
export function visibleMaterialRows<T extends { isActive: boolean }>(
  rows: readonly T[],
  showArchived: boolean,
): T[] {
  return showArchived ? [...rows] : rows.filter((r) => r.isActive);
}

/** Every relation of the unified stock variant (movements, receipts, order lines, printer slots, designs, imports). */
async function variantHistoryCounts(db: Db, variantId: string | null): Promise<MaterialHistoryCounts> {
  if (!variantId) return {};
  const v = await db.stockVariant.findUnique({
    where: { id: variantId },
    select: {
      _count: {
        select: {
          movements: true,
          receipts: true,
          orderLines: true,
          printerSlots: true,
          designs: true,
          importLines: true,
        },
      },
    },
  });
  if (!v) return {};
  return {
    variantMovements: v._count.movements,
    variantReceipts: v._count.receipts,
    variantOrderLines: v._count.orderLines,
    variantPrinterSlots: v._count.printerSlots,
    variantDesigns: v._count.designs,
    variantImportLines: v._count.importLines,
  };
}

/** History of a roll; null when the roll does not exist. */
export async function lfMaterialHistoryCounts(db: Db, id: string): Promise<MaterialHistoryCounts | null> {
  const m = await db.largeFormatMaterial.findUnique({
    where: { id },
    select: {
      stockVariantId: true,
      _count: { select: { orderLines: true, rollReceipts: true, stockMovements: true, sizePresets: true } },
    },
  });
  if (!m) return null;
  const supplierMappings: number = await db.supplierItemMapping.count({
    where: { targetKind: "lf_material", targetId: id },
  });
  return {
    orderLines: m._count.orderLines,
    receipts: m._count.rollReceipts,
    movements: m._count.stockMovements,
    sizePresets: m._count.sizePresets,
    supplierMappings,
    ...(await variantHistoryCounts(db, m.stockVariantId)),
  };
}

/** History of a sheet paper; null when the paper does not exist. */
export async function sheetPaperHistoryCounts(db: Db, id: string): Promise<MaterialHistoryCounts | null> {
  const p = await db.sheetPaper.findUnique({
    where: { id },
    select: {
      stockVariantId: true,
      _count: { select: { orderLines: true, receipts: true, stockMovements: true } },
    },
  });
  if (!p) return null;
  const supplierMappings: number = await db.supplierItemMapping.count({
    where: { targetKind: "sheet_paper", targetId: id },
  });
  return {
    orderLines: p._count.orderLines,
    receipts: p._count.receipts,
    movements: p._count.stockMovements,
    supplierMappings,
    ...(await variantHistoryCounts(db, p.stockVariantId)),
  };
}

/** Body of the 409 refusal (RU text for logs / non-i18n clients; the admin page maps the code). */
export function materialHasHistoryBody(kind: "lf" | "paper"): { error: string; message: string } {
  return {
    error: MATERIAL_HAS_HISTORY_ERROR,
    message:
      kind === "lf"
        ? "У материала есть история (заказы, приходы или списания) — удалить нельзя, отправьте его в архив."
        : "У бумаги есть история (заказы, приходы или списания) — удалить нельзя, отправьте её в архив.",
  };
}
