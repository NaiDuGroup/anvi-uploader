import type { Prisma, PrismaClient } from "@prisma/client";
import { MATERIAL_VARIANT_STOCK_SELECT, materialStockOf } from "@/lib/stock/unified/materials";

/**
 * A sheet paper as the pricing code sees it: the `SheetPaper` config / price
 * columns plus balance and cost from its unified stock variant. The legacy
 * stock columns of `SheetPaper` are never read.
 */

type Db = Prisma.TransactionClient | PrismaClient;

export const SHEET_PAPER_PRICING_SELECT = {
  id: true,
  stockVariantId: true,
  name: true,
  gsm: true,
  sheetWidthCm: true,
  sheetHeightCm: true,
  retailPricePerSheet: true,
  dealerPricePerSheet: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  stockVariant: MATERIAL_VARIANT_STOCK_SELECT,
} as const satisfies Prisma.SheetPaperSelect;

export type SheetPaperRow = Prisma.SheetPaperGetPayload<{ select: typeof SHEET_PAPER_PRICING_SELECT }>;

export type SheetPaperPricing = Omit<SheetPaperRow, "stockVariant"> & {
  /** Balance in sheets. */
  sheetsInStock: number;
  /** Weighted-average purchase cost per sheet; null until the first receipt. */
  avgCostPerSheet: number | null;
  /** Manual cost hint per sheet (variant `purchaseCost`), used until the first receipt. */
  catalogCostPerSheet: number;
  /** SKU of the stock variant (PAPER-…); null when the row has no variant yet. */
  stockSku: string | null;
};

export function toSheetPaperPricing(row: SheetPaperRow): SheetPaperPricing {
  const { stockVariant, ...rest } = row;
  const stock = materialStockOf(stockVariant);
  return {
    ...rest,
    sheetsInStock: stock.stock,
    avgCostPerSheet: stock.avgCost,
    catalogCostPerSheet: stock.purchaseCost,
    stockSku: stock.sku,
  };
}

export async function findSheetPaperPricing(db: Db, id: string): Promise<SheetPaperPricing | null> {
  const row = await db.sheetPaper.findUnique({ where: { id }, select: SHEET_PAPER_PRICING_SELECT });
  return row ? toSheetPaperPricing(row) : null;
}

/** Catalog order (sort order, then name). */
export async function findSheetPapersPricing(
  db: Db,
  where?: Prisma.SheetPaperWhereInput,
): Promise<SheetPaperPricing[]> {
  const rows = await db.sheetPaper.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: SHEET_PAPER_PRICING_SELECT,
  });
  return rows.map(toSheetPaperPricing);
}
