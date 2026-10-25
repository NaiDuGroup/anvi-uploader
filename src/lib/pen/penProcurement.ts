import { mapLegacyProductProcurementItems } from "@/lib/stock/unified/singleVariantProduct";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import type { PenProductSnapshot } from "./penProductSnapshot";

/** `OrderLine.productType` / `Order.productType` of pen lines. */
export const PEN_PRODUCT_TYPE = "pen";

/** Readable procurement label for a pen line, e.g. «Ручка Ardenes чёрная (ARDENES_BLACK)». */
export function penProcurementLabel(snapshot: Pick<PenProductSnapshot, "nameRu" | "sku"> | null): string {
  if (!snapshot) return "Ручка";
  const sku: string = snapshot.sku && snapshot.sku !== "—" ? ` (${snapshot.sku})` : "";
  return `${snapshot.nameRu}${sku}`;
}

/**
 * Rewrite legacy `pen` procurement entries (keyed by the old `pen_products.id`)
 * as unified `stock_variant` entries. Entries whose pen has no variant stay as
 * they are; everything else passes through untouched.
 */
export function mapLegacyPenProcurementItems(
  items: readonly OrderProcurementMetaItem[],
  variantIdByLegacyId: ReadonlyMap<string, string>,
): OrderProcurementMetaItem[] {
  return mapLegacyProductProcurementItems(items, "pen", variantIdByLegacyId, "Ручка");
}
