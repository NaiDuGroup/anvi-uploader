import type { Prisma, PrismaClient } from "@prisma/client";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";

/**
 * Shared helpers for catalog products that live in the unified stock as one
 * `StockItem` per model with exactly one `StockVariant` (mugs, notebooks, pens).
 * The **variant id** is the product id that travels through APIs and order
 * lines; rows migrated from a legacy table keep the old id in
 * `StockItem.legacyId` (`legacyKind`), so legacy ids still resolve.
 */

type Db = Prisma.TransactionClient | PrismaClient;

/** Legacy procurement kinds keyed by the old product id (`productId`). */
export type LegacyProductProcurementKind = "mug" | "notebook" | "pen";

const FIRST_VARIANT = {
  orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  take: 1,
  select: { id: true },
} as const satisfies Prisma.StockItem$variantsArgs;

/**
 * Legacy-id helper: the variant id for `id`, which may already be a variant id
 * of the category (`variantWhere`) or an old legacy product id. Null when neither matches.
 */
export async function resolveSingleVariantId(
  db: Db,
  cfg: { variantWhere: Prisma.StockVariantWhereInput; legacyKind: string },
  id: string | null | undefined,
): Promise<string | null> {
  if (!id) return null;
  const direct = await db.stockVariant.findFirst({
    where: { id, ...cfg.variantWhere },
    select: { id: true },
  });
  if (direct) return direct.id;
  const legacy = await db.stockItem.findUnique({
    where: { legacyKind_legacyId: { legacyKind: cfg.legacyKind, legacyId: id } },
    select: { variants: FIRST_VARIANT },
  });
  return legacy?.variants[0]?.id ?? null;
}

/** Map of legacy product id → variant id for the given legacy ids (unknown ids are left out). */
export async function singleVariantIdsByLegacyId(
  db: Db,
  legacyKind: string,
  legacyIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids: string[] = [...new Set(legacyIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return new Map();
  const items = await db.stockItem.findMany({
    where: { legacyKind, legacyId: { in: ids } },
    select: { legacyId: true, variants: FIRST_VARIANT },
  });
  const out = new Map<string, string>();
  for (const it of items) {
    const v = it.variants[0];
    if (it.legacyId && v) out.set(it.legacyId, v.id);
  }
  return out;
}

/** Id of a unified stock category by code; throws with a migration hint when missing. */
export async function requireStockCategoryId(db: Db, code: string, migration: string): Promise<string> {
  const cat = await db.stockCategory.findUnique({ where: { code }, select: { id: true } });
  if (!cat) throw new Error(`Stock category «${code}» is missing — run the ${migration} migration`);
  return cat.id;
}

/**
 * Rewrite legacy procurement entries of `kind` (keyed by the old product id) as
 * unified `stock_variant` entries labelled «<labelPrefix> <sku>». Entries whose
 * product has no variant stay as they are; everything else passes through.
 */
export function mapLegacyProductProcurementItems(
  items: readonly OrderProcurementMetaItem[],
  kind: LegacyProductProcurementKind,
  variantIdByLegacyId: ReadonlyMap<string, string>,
  labelPrefix: string,
): OrderProcurementMetaItem[] {
  return items.map((m) => {
    if (m.kind !== kind) return m;
    const variantId: string | undefined = variantIdByLegacyId.get(m.productId);
    if (!variantId) return m;
    return {
      kind: "stock_variant",
      variantId,
      label: m.sku ? `${labelPrefix} ${m.sku}` : labelPrefix,
      requestedQty: m.requestedQty,
      stockAtOrder: m.stockAtOrder,
    };
  });
}

/** Readable procurement label «<name> (<sku>)» from a product snapshot (fallback when missing). */
export function productProcurementLabel(
  snapshot: { nameRu?: string; sku?: string } | null,
  fallback: string,
): string {
  if (!snapshot) return fallback;
  const sku: string = snapshot.sku && snapshot.sku !== "—" ? ` (${snapshot.sku})` : "";
  return `${snapshot.nameRu ?? fallback}${sku}`;
}
