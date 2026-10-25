import type { Prisma, PrismaClient } from "@prisma/client";
import { MUGS_CATEGORY_CODE, parseMugAttributes } from "@/lib/mug/mugVariant";
import { NOTEBOOKS_CATEGORY_CODE, parseNotebookAttributes } from "@/lib/notebook/notebookVariant";

/**
 * Product binding of a design (mug / notebook). Mugs and notebooks live in the
 * unified stock, so a design points at its product through `Design.stockVariantId`
 * (every design migrated from the old catalog tables carries it too):
 *
 * - write: {@link designProductBinding} checks the variant belongs to the kind's category;
 * - read: {@link withDesignProducts} returns the variant id in `mugProductId` /
 *   `notebookProductId` with the product's label / photo / colour attached.
 */

type Db = Prisma.TransactionClient | PrismaClient;

export type DesignProductKind = "mug" | "notebook";

/** Label / photo / swatch of the product a design is made for. */
export type DesignProductInfo = {
  sku: string;
  nameRu: string;
  imageUrl: string | null;
};

export type DesignMugInfo = DesignProductInfo & { bodyColorHex: string };
export type DesignNotebookInfo = DesignProductInfo & { coverColorHex: string };

/** Column that binds a design to its product. */
export type DesignProductColumns = {
  stockVariantId: string | null;
};

const CATEGORY_BY_KIND: Readonly<Record<DesignProductKind, string>> = {
  mug: MUGS_CATEGORY_CODE,
  notebook: NOTEBOOKS_CATEGORY_CODE,
};

export const NO_DESIGN_PRODUCT: DesignProductColumns = { stockVariantId: null };

/**
 * Column to store for a design bound to `variantId` (already resolved from any
 * legacy id); unbound when the variant is not in the kind's category.
 */
export async function designProductBinding(
  db: Db,
  kind: DesignProductKind,
  variantId: string,
): Promise<DesignProductColumns> {
  const v = await db.stockVariant.findFirst({
    where: { id: variantId, item: { category: { code: CATEGORY_BY_KIND[kind] } } },
    select: { id: true },
  });
  return v ? { stockVariantId: v.id } : NO_DESIGN_PRODUCT;
}

type DesignProductRow = DesignProductColumns & { targetType: string };

export type WithDesignProduct<T> = Omit<T, "mugProductId" | "notebookProductId" | "stockVariantId"> & {
  /** Unified variant the design is bound to. */
  stockVariantId: string | null;
  /** Mug **variant** id for mug designs (null otherwise). */
  mugProductId: string | null;
  /** Notebook **variant** id for notebook designs (null otherwise). */
  notebookProductId: string | null;
  mugProduct: DesignMugInfo | null;
  notebookProduct: DesignNotebookInfo | null;
};

/** Design rows with the product ids as variant ids and the product's catalog info attached. */
export async function withDesignProducts<T extends DesignProductRow>(
  db: Db,
  rows: readonly T[],
): Promise<WithDesignProduct<T>[]> {
  const variantIds: (string | null)[] = rows.map((r) => r.stockVariantId);
  const ids: string[] = [...new Set(variantIds.filter((x): x is string => Boolean(x)))];
  const variants = ids.length
    ? await db.stockVariant.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          item: {
            select: {
              sku: true,
              nameRu: true,
              imageUrl: true,
              attributes: true,
              category: { select: { code: true } },
            },
          },
        },
      })
    : [];
  const byId = new Map(variants.map((v) => [v.id, v]));

  return rows.map((r, i) => {
    const variantId: string | null = variantIds[i] ?? null;
    const v = variantId ? byId.get(variantId) : undefined;
    const base = { sku: v?.item.sku ?? "", nameRu: v?.item.nameRu ?? "", imageUrl: v?.item.imageUrl ?? null };
    const code: string | undefined = v?.item.category.code;
    const isMug: boolean = r.targetType === "mug" && code === MUGS_CATEGORY_CODE;
    const isNotebook: boolean = r.targetType === "notebook" && code === NOTEBOOKS_CATEGORY_CODE;
    return {
      ...r,
      stockVariantId: v ? v.id : r.stockVariantId,
      mugProductId: isMug ? v!.id : null,
      notebookProductId: isNotebook ? v!.id : null,
      mugProduct: isMug ? { ...base, bodyColorHex: parseMugAttributes(v!.item.attributes).bodyColorHex } : null,
      notebookProduct: isNotebook
        ? { ...base, coverColorHex: parseNotebookAttributes(v!.item.attributes).coverColorHex }
        : null,
    };
  });
}

export async function withDesignProduct<T extends DesignProductRow>(db: Db, row: T): Promise<WithDesignProduct<T>> {
  return (await withDesignProducts(db, [row]))[0]!;
}
