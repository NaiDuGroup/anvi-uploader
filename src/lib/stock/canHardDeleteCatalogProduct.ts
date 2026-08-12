import { prisma } from "@/lib/prisma";

export type CatalogProductKind = "mug" | "notebook";

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
 * live order / order-line FKs. Otherwise keep the product and deactivate.
 */
export async function checkCatalogProductHardDelete(
  kind: CatalogProductKind,
  productId: string,
): Promise<CatalogHardDeleteCheck> {
  if (kind === "mug") {
    const [movements, orderCount, lineCount] = await Promise.all([
      prisma.mugStockMovement.count({ where: { mugProductId: productId } }),
      prisma.order.count({ where: { mugProductId: productId } }),
      prisma.orderLine.count({ where: { mugProductId: productId } }),
    ]);
    return evaluateCatalogHardDeleteGuard(movements, orderCount + lineCount);
  }

  const [movements, orderCount, lineCount] = await Promise.all([
    prisma.notebookStockMovement.count({
      where: { notebookProductId: productId },
    }),
    prisma.order.count({ where: { notebookProductId: productId } }),
    prisma.orderLine.count({ where: { notebookProductId: productId } }),
  ]);
  return evaluateCatalogHardDeleteGuard(movements, orderCount + lineCount);
}
