import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import {
  mapLegacyProductProcurementItems,
  productProcurementLabel,
} from "@/lib/stock/unified/singleVariantProduct";
import type { MugProductSnapshot } from "./mugProductSnapshot";

/** `OrderLine.productType` / `Order.productType` of mug lines. */
export const MUG_PRODUCT_TYPE = "mug";

/** Readable procurement label for a mug line, e.g. «Кружка белая 330 мл (MUG-WHITE)». */
export function mugProcurementLabel(snapshot: Pick<MugProductSnapshot, "nameRu" | "sku"> | null): string {
  return productProcurementLabel(snapshot, "Кружка");
}

/**
 * Rewrite legacy `mug` procurement entries (keyed by the old `mug_products.id`)
 * as unified `stock_variant` entries. Entries whose mug has no variant stay as
 * they are; everything else passes through untouched.
 */
export function mapLegacyMugProcurementItems(
  items: readonly OrderProcurementMetaItem[],
  variantIdByLegacyId: ReadonlyMap<string, string>,
): OrderProcurementMetaItem[] {
  return mapLegacyProductProcurementItems(items, "mug", variantIdByLegacyId, "Кружка");
}
