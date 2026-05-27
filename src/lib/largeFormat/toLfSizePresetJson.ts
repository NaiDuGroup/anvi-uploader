import type { LfMaterialSizePreset } from "@prisma/client";

/** Wire shape for LF material size preset (admin catalog + wizard bootstrap). */
export interface LfSizePresetJson {
  id: string;
  materialId: string;
  widthCm: number;
  heightCm: number;
  retailPriceMdl: number;
  dealerPriceMdl: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toLfSizePresetJson(p: LfMaterialSizePreset): LfSizePresetJson {
  return {
    id: p.id,
    materialId: p.materialId,
    widthCm: p.widthCm,
    heightCm: p.heightCm,
    retailPriceMdl: p.retailPriceMdl,
    dealerPriceMdl: p.dealerPriceMdl,
    sortOrder: p.sortOrder,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
