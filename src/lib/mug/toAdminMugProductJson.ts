import { parsePrintMethods } from "@/lib/stock/unified/printMethods";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { mugVariantFields, type MugVariantWithItem } from "./mugVariant";

/**
 * JSON-safe row for the admin mug catalog API. Same shape as the legacy
 * mug-product JSON; `id` is the unified **variant** id.
 */
export function toAdminMugProductJson(v: MugVariantWithItem) {
  const f = mugVariantFields(v);
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
    bodyColorHex: f.bodyColorHex,
    handleColorHex: f.handleColorHex,
    innerColorHex: f.innerColorHex,
    rimColorHex: f.rimColorHex,
    printWidthCm: f.printWidthCm,
    printHeightCm: f.printHeightCm,
    printDpi: f.printDpi,
    has3dPreview: f.has3dPreview,
    printMethods: parsePrintMethods(v.item.printMethods),
    isActive: f.isActive,
    sortOrder: v.item.sortOrder,
    internalNotes: v.item.internalNotes,
    createdAt: v.item.createdAt.toISOString(),
    updatedAt: (v.updatedAt > v.item.updatedAt ? v.updatedAt : v.item.updatedAt).toISOString(),
    // Unified items do not record their author.
    createdById: null as string | null,
  };
}
