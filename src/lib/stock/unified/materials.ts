import { Prisma, type PrismaClient } from "@prisma/client";
import { requireStockCategoryId } from "./singleVariantProduct";

/**
 * Wide-format roll media and sheet paper on the unified stock (stage 4 of
 * docs/UNIFIED-STOCK-PLAN.md). The pricing / config rows stay in
 * `LargeFormatMaterial` and `SheetPaper`; each links to one `StockVariant`
 * (`stockVariantId`) that holds its balance, weighted-average cost and the
 * manual cost hint (`purchaseCost`). Every stock change goes through the ledger.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

/** «Широкоформатные материалы»: one item + variant per roll, counted in metres. */
export const ROLL_MEDIA_CATEGORY_CODE = "roll_media";
/** «Листовая бумага»: one item + variant per paper, counted in sheets. */
export const SHEET_PAPER_CATEGORY_CODE = "sheet_paper";
export const MATERIAL_CATEGORY_CODES: readonly string[] = [ROLL_MEDIA_CATEGORY_CODE, SHEET_PAPER_CATEGORY_CODE];

/** `StockItem.legacyKind` of rolls / papers; `legacyId` is the pricing row id. */
export const LF_MATERIAL_LEGACY_KIND = "lf_material";
export const SHEET_PAPER_LEGACY_KIND = "sheet_paper";

/**
 * `large_format_materials.cost_per_lm` / `sheet_papers.cost_per_sheet` are still
 * NOT NULL without a default until the cleanup stage drops them. New rows get
 * this placeholder; the real cost hint lives on the variant (`purchaseCost`)
 * and the columns are never read.
 */
export const LEGACY_COST_COLUMN_PLACEHOLDER = 0;

const MATERIALS_MIGRATION = "20261025220000_unified_stock_materials";

export const ROLL_MEDIA_VARIANT_WHERE = {
  item: { category: { code: ROLL_MEDIA_CATEGORY_CODE } },
} as const satisfies Prisma.StockVariantWhereInput;

export const SHEET_PAPER_VARIANT_WHERE = {
  item: { category: { code: SHEET_PAPER_CATEGORY_CODE } },
} as const satisfies Prisma.StockVariantWhereInput;

/** Balance and cost columns of the linked variant (select for the `stockVariant` relation). */
export const MATERIAL_VARIANT_STOCK_SELECT = {
  select: { id: true, sku: true, stockQuantity: true, avgCost: true, purchaseCost: true },
} as const;

export type MaterialVariantStockRow = {
  id: string;
  sku: string;
  stockQuantity: Prisma.Decimal;
  avgCost: Prisma.Decimal | null;
  purchaseCost: Prisma.Decimal | null;
} | null;

/** Balance / cost of a roll or paper as plain numbers. */
export type MaterialStock = {
  variantId: string | null;
  /** Variant SKU (ROLL-… / PAPER-…); null when the row has no variant. */
  sku: string | null;
  /** Balance in the category unit (m / sheets); 0 when the row has no variant. */
  stock: number;
  /** Weighted-average cost per unit; null until the first receipt. */
  avgCost: number | null;
  /** Manual cost hint per unit (used until the first receipt); 0 when unset. */
  purchaseCost: number;
};

function decimalNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value.toString());
}

export function materialStockOf(variant: MaterialVariantStockRow | undefined): MaterialStock {
  return {
    variantId: variant?.id ?? null,
    sku: variant?.sku ?? null,
    stock: decimalNumber(variant?.stockQuantity) ?? 0,
    avgCost: decimalNumber(variant?.avgCost),
    purchaseCost: decimalNumber(variant?.purchaseCost) ?? 0,
  };
}

/** Cost hint as stored on the variant (4 decimals). */
export function purchaseCostDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(Math.max(0, value).toFixed(4));
}

export type MaterialStockItemFields = {
  name: string;
  isActive: boolean;
  sortOrder: number;
  /** Category details (roll width / length, sheet size, gsm…), merged into `StockItem.attributes`. */
  attributes: Record<string, unknown>;
  /** Manual cost hint per unit. */
  purchaseCost: number;
};

function materialSku(prefix: string, legacyId: string): string {
  return `${prefix}-${legacyId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/**
 * Create the stock item + single variant for a new roll / paper (same SKU
 * scheme as the migration) and return the variant id. The caller links it via
 * `stockVariantId`.
 */
export async function createMaterialStockVariant(
  tx: Tx,
  params: {
    categoryCode: typeof ROLL_MEDIA_CATEGORY_CODE | typeof SHEET_PAPER_CATEGORY_CODE;
    legacyKind: typeof LF_MATERIAL_LEGACY_KIND | typeof SHEET_PAPER_LEGACY_KIND;
    /** Pricing row id (`LargeFormatMaterial.id` / `SheetPaper.id`). */
    legacyId: string;
    skuPrefix: "ROLL" | "PAPER";
  } & MaterialStockItemFields,
): Promise<string> {
  const categoryId: string = await requireStockCategoryId(tx, params.categoryCode, MATERIALS_MIGRATION);
  const sku: string = materialSku(params.skuPrefix, params.legacyId);
  const name: string = params.name.trim();
  const item = await tx.stockItem.create({
    data: {
      categoryId,
      sku,
      nameRo: name,
      nameRu: name,
      nameEn: name,
      attributes: params.attributes as Prisma.InputJsonObject,
      isActive: params.isActive,
      sortOrder: params.sortOrder,
      legacyKind: params.legacyKind,
      legacyId: params.legacyId,
      variants: {
        create: {
          sku,
          purchaseCost: purchaseCostDecimal(params.purchaseCost),
          isActive: params.isActive,
        },
      },
    },
    select: { variants: { select: { id: true } } },
  });
  return item.variants[0]!.id;
}

/**
 * Keep the stock item in step with an edited roll / paper: names (all three
 * languages follow the single catalog name), active flag, order, attributes
 * and the cost hint. Only the given fields change.
 */
export async function syncMaterialStockVariant(
  tx: Tx,
  variantId: string,
  patch: Partial<MaterialStockItemFields>,
): Promise<void> {
  const variant = await tx.stockVariant.findUnique({
    where: { id: variantId },
    select: { itemId: true, item: { select: { attributes: true } } },
  });
  if (!variant) return;
  const itemData: Prisma.StockItemUpdateInput = {};
  if (patch.name !== undefined) {
    const name: string = patch.name.trim();
    itemData.nameRo = name;
    itemData.nameRu = name;
    itemData.nameEn = name;
  }
  if (patch.isActive !== undefined) itemData.isActive = patch.isActive;
  if (patch.sortOrder !== undefined) itemData.sortOrder = patch.sortOrder;
  if (patch.attributes !== undefined) {
    const current = variant.item.attributes;
    const base: Prisma.JsonObject =
      current != null && typeof current === "object" && !Array.isArray(current)
        ? (current as Prisma.JsonObject)
        : {};
    itemData.attributes = { ...base, ...patch.attributes } as Prisma.InputJsonObject;
  }
  if (Object.keys(itemData).length > 0) {
    await tx.stockItem.update({ where: { id: variant.itemId }, data: itemData });
  }
  const variantData: Prisma.StockVariantUpdateInput = {};
  if (patch.isActive !== undefined) variantData.isActive = patch.isActive;
  if (patch.purchaseCost !== undefined) variantData.purchaseCost = purchaseCostDecimal(patch.purchaseCost);
  if (Object.keys(variantData).length > 0) {
    await tx.stockVariant.update({ where: { id: variantId }, data: variantData });
  }
}

/**
 * After a roll / paper pricing row is deleted: drop its stock item when it has
 * no history, otherwise deactivate it so movements, receipts and order lines
 * keep their variant.
 */
export async function retireMaterialStockVariant(tx: Tx, variantId: string): Promise<void> {
  const v = await tx.stockVariant.findUnique({
    where: { id: variantId },
    select: {
      itemId: true,
      _count: { select: { movements: true, receipts: true, orderLines: true, printerSlots: true, designs: true } },
    },
  });
  if (!v) return;
  const used: boolean = Object.values(v._count).some((n) => n > 0);
  if (used) {
    await tx.stockVariant.update({ where: { id: variantId }, data: { isActive: false } });
    await tx.stockItem.update({ where: { id: v.itemId }, data: { isActive: false } });
  } else {
    await tx.stockItem.delete({ where: { id: v.itemId } });
  }
}

/** Variant id of a roll / paper pricing row by the row id (null when the row or its link is missing). */
export async function lfMaterialVariantId(db: Db, materialId: string): Promise<string | null> {
  const m = await db.largeFormatMaterial.findUnique({
    where: { id: materialId },
    select: { stockVariantId: true },
  });
  return m?.stockVariantId ?? null;
}

export async function sheetPaperVariantId(db: Db, sheetPaperId: string): Promise<string | null> {
  const p = await db.sheetPaper.findUnique({
    where: { id: sheetPaperId },
    select: { stockVariantId: true },
  });
  return p?.stockVariantId ?? null;
}

/** Pricing-row id → variant id for many rolls (rows without a variant are left out). */
export async function lfMaterialVariantIds(db: Db, materialIds: readonly string[]): Promise<Map<string, string>> {
  const ids: string[] = [...new Set(materialIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.largeFormatMaterial.findMany({
    where: { id: { in: ids }, stockVariantId: { not: null } },
    select: { id: true, stockVariantId: true },
  });
  return new Map(rows.map((r) => [r.id, r.stockVariantId!]));
}

export async function sheetPaperVariantIds(db: Db, paperIds: readonly string[]): Promise<Map<string, string>> {
  const ids: string[] = [...new Set(paperIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.sheetPaper.findMany({
    where: { id: { in: ids }, stockVariantId: { not: null } },
    select: { id: true, stockVariantId: true },
  });
  return new Map(rows.map((r) => [r.id, r.stockVariantId!]));
}

/**
 * A roll / paper id that may be a pricing row id (legacy procurement targets,
 * e-Factura rules) or already a variant id of the category → variant id.
 */
export async function resolveMaterialVariantId(
  db: Db,
  kind: "roll" | "sheet",
  id: string | null | undefined,
): Promise<string | null> {
  if (!id) return null;
  const fromRow: string | null =
    kind === "roll" ? await lfMaterialVariantId(db, id) : await sheetPaperVariantId(db, id);
  if (fromRow) return fromRow;
  const direct = await db.stockVariant.findFirst({
    where: { id, ...(kind === "roll" ? ROLL_MEDIA_VARIANT_WHERE : SHEET_PAPER_VARIANT_WHERE) },
    select: { id: true },
  });
  return direct?.id ?? null;
}

/**
 * Variant of a roll for stock operations; creates the item + variant when an
 * old row has none yet (rows created outside the admin API, e.g. seeds).
 */
export async function requireLfMaterialVariantId(tx: Tx, materialId: string): Promise<string> {
  const m = await tx.largeFormatMaterial.findUniqueOrThrow({
    where: { id: materialId },
    select: {
      id: true,
      stockVariantId: true,
      name: true,
      isActive: true,
      sortOrder: true,
      rollWidthMeters: true,
      rollLengthMeters: true,
      printableWidthMeters: true,
    },
  });
  if (m.stockVariantId) return m.stockVariantId;
  const variantId: string = await createMaterialStockVariant(tx, {
    categoryCode: ROLL_MEDIA_CATEGORY_CODE,
    legacyKind: LF_MATERIAL_LEGACY_KIND,
    legacyId: m.id,
    skuPrefix: "ROLL",
    name: m.name,
    isActive: m.isActive,
    sortOrder: m.sortOrder,
    attributes: lfMaterialStockAttributes(m),
    purchaseCost: 0,
  });
  await tx.largeFormatMaterial.update({ where: { id: m.id }, data: { stockVariantId: variantId } });
  return variantId;
}

export async function requireSheetPaperVariantId(tx: Tx, sheetPaperId: string): Promise<string> {
  const p = await tx.sheetPaper.findUniqueOrThrow({
    where: { id: sheetPaperId },
    select: {
      id: true,
      stockVariantId: true,
      name: true,
      isActive: true,
      sortOrder: true,
      sheetWidthCm: true,
      sheetHeightCm: true,
      gsm: true,
    },
  });
  if (p.stockVariantId) return p.stockVariantId;
  const variantId: string = await createMaterialStockVariant(tx, {
    categoryCode: SHEET_PAPER_CATEGORY_CODE,
    legacyKind: SHEET_PAPER_LEGACY_KIND,
    legacyId: p.id,
    skuPrefix: "PAPER",
    name: p.name,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    attributes: sheetPaperStockAttributes(p),
    purchaseCost: 0,
  });
  await tx.sheetPaper.update({ where: { id: p.id }, data: { stockVariantId: variantId } });
  return variantId;
}

type DecimalLike = { toString(): string } | null | undefined;

function decimalAttr(value: DecimalLike): number | null {
  return value == null ? null : Number(value.toString());
}

/** `StockItem.attributes` of a roll (same keys as the migration). */
export function lfMaterialStockAttributes(m: {
  rollWidthMeters?: DecimalLike;
  rollLengthMeters?: DecimalLike;
  printableWidthMeters?: DecimalLike;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (m.rollWidthMeters !== undefined) out.rollWidthM = decimalAttr(m.rollWidthMeters);
  if (m.rollLengthMeters !== undefined) out.rollLengthM = decimalAttr(m.rollLengthMeters);
  if (m.printableWidthMeters !== undefined) out.printableWidthM = decimalAttr(m.printableWidthMeters);
  return out;
}

/** `StockItem.attributes` of a sheet paper (same keys as the migration). */
export function sheetPaperStockAttributes(p: {
  sheetWidthCm?: DecimalLike;
  sheetHeightCm?: DecimalLike;
  gsm?: number | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.sheetWidthCm !== undefined) out.sheetWidthCm = decimalAttr(p.sheetWidthCm);
  if (p.sheetHeightCm !== undefined) out.sheetHeightCm = decimalAttr(p.sheetHeightCm);
  if (p.gsm !== undefined) out.gsm = p.gsm;
  return out;
}
