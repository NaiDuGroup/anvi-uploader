import { parseUvPrintNorms } from "@/lib/uv/uvPrintNorms";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { notebookVariantFields, type NotebookVariantWithItem } from "./notebookVariant";

/**
 * JSON-safe row for the admin notebook catalog API. Same shape as the legacy
 * notebook-product JSON; `id` is the unified **variant** id.
 */
export function toAdminNotebookProductJson(v: NotebookVariantWithItem) {
  const f = notebookVariantFields(v);
  return {
    id: f.id,
    /** Unified stock item (photos / description editor). */
    itemId: f.itemId,
    sku: f.sku,
    nameRo: f.nameRo,
    nameRu: f.nameRu,
    nameEn: f.nameEn,
    stockQuantity: f.stockQuantity,
    sellPrice: f.sellPrice,
    dealerPrice: f.dealerPrice,
    purchaseCost: f.purchaseCost,
    avgPurchaseCost: f.avgCost,
    imageUrl: f.imageUrl,
    imagePublicUrl: publicAssetUrlFromStorageKey(f.imageUrl),
    coverColorHex: f.coverColorHex,
    strapColorHex: f.strapColorHex,
    bookmarkColorHex: f.bookmarkColorHex,
    paperKind: f.paperKind,
    printWidthCm: f.printWidthCm,
    printHeightCm: f.printHeightCm,
    printDpi: f.printDpi,
    has3dPreview: f.has3dPreview,
    uvPrintNorms: parseUvPrintNorms(v.item.attributes),
    isActive: f.isActive,
    sortOrder: v.item.sortOrder,
    internalNotes: v.item.internalNotes,
    createdAt: v.item.createdAt.toISOString(),
    updatedAt: (v.updatedAt > v.item.updatedAt ? v.updatedAt : v.item.updatedAt).toISOString(),
    // Unified items do not record their author.
    createdById: null as string | null,
  };
}
