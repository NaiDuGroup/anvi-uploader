import type { Prisma, PrismaClient } from "@prisma/client";
import { MATERIAL_VARIANT_STOCK_SELECT, materialStockOf, type MaterialStock } from "@/lib/stock/unified/materials";

/**
 * A wide-format roll as the pricing code sees it: the `LargeFormatMaterial`
 * pricing / config columns plus balance and cost from its unified stock
 * variant. The legacy stock columns of `LargeFormatMaterial` are never read.
 */

type Db = Prisma.TransactionClient | PrismaClient;

export const LF_MATERIAL_PRICING_SELECT = {
  id: true,
  stockVariantId: true,
  name: true,
  rollWidthMeters: true,
  printableWidthMeters: true,
  rollLengthMeters: true,
  dealerPricePerLinearMeter: true,
  retailPricePerLinearMeter: true,
  dealerPrintPricePerLinearMeter: true,
  retailPrintPricePerLinearMeter: true,
  finalRetailPricePerLinearMeter: true,
  finalDealerPricePerLinearMeter: true,
  manualFinalRetailPricePerLinearMeter: true,
  manualFinalDealerPricePerLinearMeter: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  stockVariant: MATERIAL_VARIANT_STOCK_SELECT,
} as const satisfies Prisma.LargeFormatMaterialSelect;

export const LF_MATERIAL_WITH_PRESETS_SELECT = {
  ...LF_MATERIAL_PRICING_SELECT,
  sizePresets: true,
} as const satisfies Prisma.LargeFormatMaterialSelect;

export type LfMaterialRow = Prisma.LargeFormatMaterialGetPayload<{ select: typeof LF_MATERIAL_PRICING_SELECT }>;

/** Stock / cost of a roll, from its variant. */
export type LfMaterialStockFields = {
  /** Balance in linear metres. */
  stockLm: number;
  /** Weighted-average purchase cost per linear metre; null until the first receipt. */
  avgCostPerLm: number | null;
  /** Manual cost hint per linear metre (variant `purchaseCost`), used until the first receipt. */
  catalogCostPerLm: number;
  /** SKU of the stock variant (ROLL-…); null when the row has no variant yet. */
  stockSku: string | null;
};

export type LfPricingMaterial = Omit<LfMaterialRow, "stockVariant"> & LfMaterialStockFields;

export function lfMaterialStockFields(stock: MaterialStock): LfMaterialStockFields {
  return {
    stockLm: stock.stock,
    avgCostPerLm: stock.avgCost,
    catalogCostPerLm: stock.purchaseCost,
    stockSku: stock.sku,
  };
}

/** Flatten the variant's balance / cost onto the pricing row. */
export function toLfPricingMaterial<T extends LfMaterialRow>(
  row: T,
): Omit<T, "stockVariant"> & LfMaterialStockFields {
  const { stockVariant, ...rest } = row;
  return { ...rest, ...lfMaterialStockFields(materialStockOf(stockVariant)) };
}

export async function findLfPricingMaterials(
  db: Db,
  args: {
    where?: Prisma.LargeFormatMaterialWhereInput;
    orderBy?: Prisma.LargeFormatMaterialOrderByWithRelationInput[];
  } = {},
): Promise<LfPricingMaterial[]> {
  const rows = await db.largeFormatMaterial.findMany({
    where: args.where,
    orderBy: args.orderBy,
    select: LF_MATERIAL_PRICING_SELECT,
  });
  return rows.map(toLfPricingMaterial);
}

export async function findLfPricingMaterial(db: Db, id: string): Promise<LfPricingMaterial | null> {
  const row = await db.largeFormatMaterial.findUnique({ where: { id }, select: LF_MATERIAL_PRICING_SELECT });
  return row ? toLfPricingMaterial(row) : null;
}

export type LfPricingMaterialWithPresets = LfPricingMaterial & {
  sizePresets: Prisma.LfMaterialSizePresetGetPayload<object>[];
};

/** Catalog order (sort order, then name), with size presets. */
export async function findLfPricingMaterialsWithPresets(
  db: Db,
  where?: Prisma.LargeFormatMaterialWhereInput,
): Promise<LfPricingMaterialWithPresets[]> {
  const rows = await db.largeFormatMaterial.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: LF_MATERIAL_WITH_PRESETS_SELECT,
  });
  return rows.map(toLfPricingMaterial);
}

export async function findLfPricingMaterialWithPresets(
  db: Db,
  id: string,
): Promise<LfPricingMaterialWithPresets | null> {
  const row = await db.largeFormatMaterial.findUnique({ where: { id }, select: LF_MATERIAL_WITH_PRESETS_SELECT });
  return row ? toLfPricingMaterial(row) : null;
}
