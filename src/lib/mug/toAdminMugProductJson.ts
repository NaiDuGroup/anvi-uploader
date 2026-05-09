import type { MugProduct } from "@prisma/client";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";

/** JSON-safe row for admin catalog API. */
export function toAdminMugProductJson(r: MugProduct) {
  return {
    id: r.id,
    sku: r.sku,
    nameRo: r.nameRo,
    nameRu: r.nameRu,
    nameEn: r.nameEn,
    stockQuantity: r.stockQuantity,
    sellPrice: r.sellPrice,
    dealerPrice: r.dealerPrice,
    imageUrl: r.imageUrl,
    imagePublicUrl: publicAssetUrlFromStorageKey(r.imageUrl),
    bodyColorHex: r.bodyColorHex,
    handleColorHex: r.handleColorHex,
    innerColorHex: r.innerColorHex,
    rimColorHex: r.rimColorHex,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    internalNotes: r.internalNotes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdById: r.createdById,
  };
}
