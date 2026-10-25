import type { Prisma, PrismaClient } from "@prisma/client";
import { resolveSingleVariantId } from "@/lib/stock/unified/singleVariantProduct";
import { parsePenAttributes, type PenAttributes } from "./penVariantAttributes";

export {
  PEN_ATTRIBUTE_DEFAULTS,
  parsePenAttributes,
  penAttributesJson,
  type PenAttributes,
} from "./penVariantAttributes";

/**
 * Pens live in the unified stock as category `pens`: one `StockItem` per pen
 * model with exactly one `StockVariant`. The **variant id** is the pen id that
 * travels through APIs, wizard state and order lines (`OrderLine.stockVariantId`).
 *
 * Pens migrated from the legacy `pen_products` table keep the old id in
 * `StockItem.legacyId` (`legacyKind = 'pen'`), so payloads / URLs that still
 * carry a legacy pen id resolve through {@link resolvePenVariantId}.
 */

export const PENS_CATEGORY_CODE = "pens";
export const PEN_LEGACY_KIND = "pen";

type Db = Prisma.TransactionClient | PrismaClient;

export const PEN_VARIANT_INCLUDE = { item: true } as const satisfies Prisma.StockVariantInclude;

export type PenVariantWithItem = Prisma.StockVariantGetPayload<{ include: typeof PEN_VARIANT_INCLUDE }>;

/** Variants of the «Ручки» category. */
export const PEN_VARIANT_WHERE = {
  item: { category: { code: PENS_CATEGORY_CODE } },
} as const satisfies Prisma.StockVariantWhereInput;

/** Active pen variants (variant, item and category active). */
export const ACTIVE_PEN_VARIANT_WHERE = {
  isActive: true,
  item: { isActive: true, category: { code: PENS_CATEGORY_CODE, isActive: true } },
} as const satisfies Prisma.StockVariantWhereInput;

export const PEN_VARIANT_ORDER_BY = [
  { item: { sortOrder: "asc" } },
  { item: { sku: "asc" } },
  { sortOrder: "asc" },
] as const satisfies Prisma.StockVariantOrderByWithRelationInput[];

/**
 * Legacy-id helper: the pen variant id for `id`, which may already be a pen
 * variant id or an old `pen_products.id`. Null when neither matches.
 */
export async function resolvePenVariantId(
  db: Db,
  id: string | null | undefined,
): Promise<string | null> {
  return resolveSingleVariantId(db, { variantWhere: PEN_VARIANT_WHERE, legacyKind: PEN_LEGACY_KIND }, id);
}


/** Pen variant (with its item) by variant id or legacy pen id; `activeOnly` for ordering. */
export async function loadPenVariant(
  db: Db,
  id: string | null | undefined,
  opts: { activeOnly?: boolean } = {},
): Promise<PenVariantWithItem | null> {
  const variantId: string | null = await resolvePenVariantId(db, id);
  if (!variantId) return null;
  return db.stockVariant.findFirst({
    where: { id: variantId, ...(opts.activeOnly ? ACTIVE_PEN_VARIANT_WHERE : PEN_VARIANT_WHERE) },
    include: PEN_VARIANT_INCLUDE,
  });
}

/** Active pen variants in catalog order (public picker, wizards). */
export async function listActivePenVariants(db: Db): Promise<PenVariantWithItem[]> {
  return db.stockVariant.findMany({
    where: ACTIVE_PEN_VARIANT_WHERE,
    include: PEN_VARIANT_INCLUDE,
    orderBy: [...PEN_VARIANT_ORDER_BY],
  });
}

/** Category id of «Ручки» (created by the `unified_stock_pens` migration). */
export async function requirePensCategoryId(db: Db): Promise<string> {
  const cat = await db.stockCategory.findUnique({
    where: { code: PENS_CATEGORY_CODE },
    select: { id: true },
  });
  if (!cat) throw new Error("Stock category «pens» is missing — run the unified_stock_pens migration");
  return cat.id;
}

function decimalNumber(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value.toString());
}

/** Plain pen fields of a variant + item (names, photo, prices, print area). */
export function penVariantFields(v: PenVariantWithItem) {
  const attrs: PenAttributes = parsePenAttributes(v.item.attributes);
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
