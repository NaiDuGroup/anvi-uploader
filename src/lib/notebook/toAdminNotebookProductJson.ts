import type { NotebookProduct, Prisma } from "@prisma/client";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { coerceNotebookPaperKind } from "./notebookPaperKind";

function decimalToNumber(d: Prisma.Decimal | null): number | null {
  return d == null ? null : Number(d.toString());
}

/** JSON-safe row for admin notebook catalog API. */
export function toAdminNotebookProductJson(r: NotebookProduct) {
  return {
    id: r.id,
    sku: r.sku,
    nameRo: r.nameRo,
    nameRu: r.nameRu,
    nameEn: r.nameEn,
    stockQuantity: r.stockQuantity,
    sellPrice: decimalToNumber(r.sellPrice),
    dealerPrice: decimalToNumber(r.dealerPrice),
    purchaseCost: decimalToNumber(r.purchaseCost),
    imageUrl: r.imageUrl,
    imagePublicUrl: publicAssetUrlFromStorageKey(r.imageUrl),
    coverColorHex: r.coverColorHex,
    strapColorHex: r.strapColorHex,
    bookmarkColorHex: r.bookmarkColorHex,
    paperKind: coerceNotebookPaperKind(r.paperKind),
    // Decimal fields are serialized as numbers for the client.
    printWidthCm: Number(r.printWidthCm.toString()),
    printHeightCm: Number(r.printHeightCm.toString()),
    printDpi: r.printDpi,
    has3dPreview: r.has3dPreview,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    internalNotes: r.internalNotes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdById: r.createdById,
  };
}
