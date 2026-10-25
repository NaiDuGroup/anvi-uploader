import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { penVariantFields, type PenVariantWithItem } from "./penVariant";

/**
 * Admin pen catalog row (`/api/admin/pen-products`). Same shape as the legacy
 * pen-product JSON; `id` is the unified **variant** id.
 */
export function toAdminPenProductJson(v: PenVariantWithItem) {
  const f = penVariantFields(v);
  return {
    id: f.id,
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
    clipColorHex: f.clipColorHex,
    printWidthCm: f.printWidthCm,
    printHeightCm: f.printHeightCm,
    printDpi: f.printDpi,
    has3dPreview: f.has3dPreview,
    isActive: f.isActive,
    sortOrder: v.item.sortOrder,
    internalNotes: v.item.internalNotes,
    // Unified items do not record their author.
    createdBy: null as string | null,
    createdAt: v.item.createdAt.toISOString(),
    updatedAt: (v.updatedAt > v.item.updatedAt ? v.updatedAt : v.item.updatedAt).toISOString(),
  };
}
