import type { PenProduct, User } from "@prisma/client";

type PenProductWithCreator = PenProduct & {
  createdBy: Pick<User, "name" | "displayName"> | null;
};

export function toAdminPenProductJson(p: PenProductWithCreator) {
  return {
    id: p.id,
    sku: p.sku,
    nameRo: p.nameRo,
    nameRu: p.nameRu,
    nameEn: p.nameEn,
    stockQuantity: p.stockQuantity,
    sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
    dealerPrice: p.dealerPrice ? Number(p.dealerPrice) : null,
    purchaseCost: p.purchaseCost ? Number(p.purchaseCost) : null,
    imageUrl: p.imageUrl,
    bodyColorHex: p.bodyColorHex,
    clipColorHex: p.clipColorHex,
    printWidthCm: Number(p.printWidthCm),
    printHeightCm: Number(p.printHeightCm),
    printDpi: p.printDpi,
    has3dPreview: p.has3dPreview,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    internalNotes: p.internalNotes,
    createdBy: p.createdBy ? p.createdBy.displayName || p.createdBy.name : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
