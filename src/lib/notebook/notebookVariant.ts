import type { Prisma, PrismaClient } from "@prisma/client";
import { resolveSingleVariantId } from "@/lib/stock/unified/singleVariantProduct";
import { parseNotebookAttributes, type NotebookAttributes } from "./notebookVariantAttributes";

export {
  NOTEBOOK_ATTRIBUTE_DEFAULTS,
  notebookAttributesJson,
  parseNotebookAttributes,
  type NotebookAttributes,
} from "./notebookVariantAttributes";

/**
 * Notebooks live in the unified stock as category `notebooks`: one `StockItem`
 * per notebook model with exactly one `StockVariant`. The **variant id** is the
 * notebook id that travels through APIs, wizard state and order lines
 * (`OrderLine.stockVariantId`).
 *
 * Notebooks migrated from the legacy `notebook_products` table keep the old id
 * in `StockItem.legacyId` (`legacyKind = 'notebook'`), so payloads / URLs that
 * still carry a legacy notebook id resolve through {@link resolveNotebookVariantId}.
 */

export const NOTEBOOKS_CATEGORY_CODE = "notebooks";
export const NOTEBOOK_LEGACY_KIND = "notebook";

type Db = Prisma.TransactionClient | PrismaClient;

export const NOTEBOOK_VARIANT_INCLUDE = { item: true } as const satisfies Prisma.StockVariantInclude;

export type NotebookVariantWithItem = Prisma.StockVariantGetPayload<{
  include: typeof NOTEBOOK_VARIANT_INCLUDE;
}>;

/** Variants of the «Блокноты» category. */
export const NOTEBOOK_VARIANT_WHERE = {
  item: { category: { code: NOTEBOOKS_CATEGORY_CODE } },
} as const satisfies Prisma.StockVariantWhereInput;

/** Active notebook variants (variant, item and category active). */
export const ACTIVE_NOTEBOOK_VARIANT_WHERE = {
  isActive: true,
  item: { isActive: true, category: { code: NOTEBOOKS_CATEGORY_CODE, isActive: true } },
} as const satisfies Prisma.StockVariantWhereInput;

export const NOTEBOOK_VARIANT_ORDER_BY = [
  { item: { sortOrder: "asc" } },
  { item: { sku: "asc" } },
  { sortOrder: "asc" },
] as const satisfies Prisma.StockVariantOrderByWithRelationInput[];

/**
 * Legacy-id helper: the notebook variant id for `id`, which may already be a
 * notebook variant id or an old `notebook_products.id`. Null when neither matches.
 */
export async function resolveNotebookVariantId(
  db: Db,
  id: string | null | undefined,
): Promise<string | null> {
  return resolveSingleVariantId(db, { variantWhere: NOTEBOOK_VARIANT_WHERE, legacyKind: NOTEBOOK_LEGACY_KIND }, id);
}


/** Notebook variant (with its item) by variant id or legacy notebook id; `activeOnly` for ordering. */
export async function loadNotebookVariant(
  db: Db,
  id: string | null | undefined,
  opts: { activeOnly?: boolean } = {},
): Promise<NotebookVariantWithItem | null> {
  const variantId: string | null = await resolveNotebookVariantId(db, id);
  if (!variantId) return null;
  return db.stockVariant.findFirst({
    where: { id: variantId, ...(opts.activeOnly ? ACTIVE_NOTEBOOK_VARIANT_WHERE : NOTEBOOK_VARIANT_WHERE) },
    include: NOTEBOOK_VARIANT_INCLUDE,
  });
}

/** All notebook variants in catalog order (admin catalog, staff wizards). */
export async function listNotebookVariants(db: Db): Promise<NotebookVariantWithItem[]> {
  return db.stockVariant.findMany({
    where: NOTEBOOK_VARIANT_WHERE,
    include: NOTEBOOK_VARIANT_INCLUDE,
    orderBy: [...NOTEBOOK_VARIANT_ORDER_BY],
  });
}

/** Active notebook variants in catalog order (public picker, purchasing). */
export async function listActiveNotebookVariants(db: Db): Promise<NotebookVariantWithItem[]> {
  return db.stockVariant.findMany({
    where: ACTIVE_NOTEBOOK_VARIANT_WHERE,
    include: NOTEBOOK_VARIANT_INCLUDE,
    orderBy: [...NOTEBOOK_VARIANT_ORDER_BY],
  });
}

/** Category id of «Блокноты» (created by the `unified_stock_notebooks` migration). */
export async function requireNotebooksCategoryId(db: Db): Promise<string> {
  const cat = await db.stockCategory.findUnique({
    where: { code: NOTEBOOKS_CATEGORY_CODE },
    select: { id: true },
  });
  if (!cat) {
    throw new Error("Stock category «notebooks» is missing — run the unified_stock_notebooks migration");
  }
  return cat.id;
}

function decimalNumber(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value.toString());
}

/** Plain notebook fields of a variant + item (names, photo, prices, colours, print area). */
export function notebookVariantFields(v: NotebookVariantWithItem) {
  const attrs: NotebookAttributes = parseNotebookAttributes(v.item.attributes);
  return {
    id: v.id,
    itemId: v.itemId,
    sku: v.item.sku,
    nameRo: v.item.nameRo,
    nameRu: v.item.nameRu,
    nameEn: v.item.nameEn,
    imageUrl: v.item.imageUrl,
    ...attrs,
    stockQuantity: Number(v.stockQuantity.toString()),
    sellPrice: decimalNumber(v.sellPrice),
    dealerPrice: decimalNumber(v.dealerPrice),
    purchaseCost: decimalNumber(v.purchaseCost),
    avgCost: decimalNumber(v.avgCost),
    isActive: v.isActive && v.item.isActive,
  };
}
