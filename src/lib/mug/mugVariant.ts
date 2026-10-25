import type { Prisma, PrismaClient } from "@prisma/client";
import {
  requireStockCategoryId,
  resolveSingleVariantId,
} from "@/lib/stock/unified/singleVariantProduct";
import { parseMugAttributes, type MugAttributes } from "./mugVariantAttributes";

export {
  MUG_ATTRIBUTE_DEFAULTS,
  mugAttributesJson,
  parseMugAttributes,
  type MugAttributes,
} from "./mugVariantAttributes";

/**
 * Mugs live in the unified stock as category `mugs`: one `StockItem` per mug
 * model with exactly one `StockVariant`. The **variant id** is the mug id that
 * travels through APIs, wizard state, designs and order lines
 * (`OrderLine.stockVariantId`, `Design.stockVariantId`).
 *
 * Mugs migrated from the legacy `mug_products` table keep the old id in
 * `StockItem.legacyId` (`legacyKind = 'mug'`), so payloads / URLs / old order
 * rows that still carry a legacy mug id resolve through {@link resolveMugVariantId}.
 */

export const MUGS_CATEGORY_CODE = "mugs";
export const MUG_LEGACY_KIND = "mug";

type Db = Prisma.TransactionClient | PrismaClient;

export const MUG_VARIANT_INCLUDE = { item: true } as const satisfies Prisma.StockVariantInclude;

export type MugVariantWithItem = Prisma.StockVariantGetPayload<{ include: typeof MUG_VARIANT_INCLUDE }>;

/** Variants of the «Кружки» category. */
export const MUG_VARIANT_WHERE = {
  item: { category: { code: MUGS_CATEGORY_CODE } },
} as const satisfies Prisma.StockVariantWhereInput;

/** Active mug variants (variant, item and category active). */
export const ACTIVE_MUG_VARIANT_WHERE = {
  isActive: true,
  item: { isActive: true, category: { code: MUGS_CATEGORY_CODE, isActive: true } },
} as const satisfies Prisma.StockVariantWhereInput;

export const MUG_VARIANT_ORDER_BY = [
  { item: { sortOrder: "asc" } },
  { item: { sku: "asc" } },
  { sortOrder: "asc" },
] as const satisfies Prisma.StockVariantOrderByWithRelationInput[];

/**
 * Legacy-id helper: the mug variant id for `id`, which may already be a mug
 * variant id or an old `mug_products.id`. Null when neither matches.
 */
export async function resolveMugVariantId(db: Db, id: string | null | undefined): Promise<string | null> {
  return resolveSingleVariantId(db, { variantWhere: MUG_VARIANT_WHERE, legacyKind: MUG_LEGACY_KIND }, id);
}


/** Mug variant (with its item) by variant id or legacy mug id; `activeOnly` for ordering. */
export async function loadMugVariant(
  db: Db,
  id: string | null | undefined,
  opts: { activeOnly?: boolean } = {},
): Promise<MugVariantWithItem | null> {
  const variantId: string | null = await resolveMugVariantId(db, id);
  if (!variantId) return null;
  return db.stockVariant.findFirst({
    where: { id: variantId, ...(opts.activeOnly ? ACTIVE_MUG_VARIANT_WHERE : MUG_VARIANT_WHERE) },
    include: MUG_VARIANT_INCLUDE,
  });
}

/** All mug variants in catalog order (admin catalog, staff tools). */
export async function listMugVariants(db: Db): Promise<MugVariantWithItem[]> {
  return db.stockVariant.findMany({
    where: MUG_VARIANT_WHERE,
    include: MUG_VARIANT_INCLUDE,
    orderBy: [...MUG_VARIANT_ORDER_BY],
  });
}

/** Active mug variants in catalog order (public picker, wizards, purchasing). */
export async function listActiveMugVariants(db: Db): Promise<MugVariantWithItem[]> {
  return db.stockVariant.findMany({
    where: ACTIVE_MUG_VARIANT_WHERE,
    include: MUG_VARIANT_INCLUDE,
    orderBy: [...MUG_VARIANT_ORDER_BY],
  });
}

/** Category id of «Кружки» (created by the `unified_stock_mugs` migration). */
export async function requireMugsCategoryId(db: Db): Promise<string> {
  return requireStockCategoryId(db, MUGS_CATEGORY_CODE, "unified_stock_mugs");
}

function decimalNumber(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value.toString());
}

/** Plain mug fields of a variant + item (names, photo, prices, colours, print area). */
export function mugVariantFields(v: MugVariantWithItem) {
  const attrs: MugAttributes = parseMugAttributes(v.item.attributes);
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
