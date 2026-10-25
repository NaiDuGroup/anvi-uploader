import { prisma } from "@/lib/prisma";

export type CatalogHardDeleteCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "has_operations";
      movements: number;
      orderRefs: number;
    };

/** Pure guard used by API + unit tests. */
export function evaluateCatalogHardDeleteGuard(
  movements: number,
  orderRefs: number,
): CatalogHardDeleteCheck {
  if (movements > 0 || orderRefs > 0) {
    return {
      ok: false,
      reason: "has_operations",
      movements,
      orderRefs,
    };
  }
  return { ok: true };
}

/**
 * Hard-delete is allowed only when the SKU has no stock ledger rows and no
 * order lines. Otherwise keep the product and deactivate. Mugs, pens and
 * notebooks are unified stock: `variantId` is the product id the catalog uses
 * (every order line migrated from the old catalog tables carries its variant).
 */
export async function checkCatalogProductHardDelete(variantId: string): Promise<CatalogHardDeleteCheck> {
  const [movements, receipts, lineCount] = await Promise.all([
    prisma.stockMovement.count({ where: { variantId } }),
    prisma.stockReceipt.count({ where: { variantId } }),
    prisma.orderLine.count({ where: { stockVariantId: variantId } }),
  ]);
  return evaluateCatalogHardDeleteGuard(movements + receipts, lineCount);
}
