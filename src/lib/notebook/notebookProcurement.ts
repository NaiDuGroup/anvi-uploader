import { mapLegacyProductProcurementItems } from "@/lib/stock/unified/singleVariantProduct";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import type { NotebookProductSnapshot } from "./notebookProductSnapshot";

/** `OrderLine.productType` / `Order.productType` of notebook lines. */
export const NOTEBOOK_PRODUCT_TYPE = "notebook";

/** Readable procurement label for a notebook line, e.g. «Блокнот A5 чёрный (S3-CBL-A5)». */
export function notebookProcurementLabel(
  snapshot: Pick<NotebookProductSnapshot, "nameRu" | "sku"> | null,
): string {
  if (!snapshot) return "Блокнот";
  const sku: string = snapshot.sku && snapshot.sku !== "—" ? ` (${snapshot.sku})` : "";
  return `${snapshot.nameRu ?? "Блокнот"}${sku}`;
}

/**
 * Rewrite legacy `notebook` procurement entries (keyed by the old
 * `notebook_products.id`) as unified `stock_variant` entries. Entries whose
 * notebook has no variant stay as they are; everything else passes through.
 */
export function mapLegacyNotebookProcurementItems(
  items: readonly OrderProcurementMetaItem[],
  variantIdByLegacyId: ReadonlyMap<string, string>,
): OrderProcurementMetaItem[] {
  return mapLegacyProductProcurementItems(items, "notebook", variantIdByLegacyId, "Блокнот");
}
