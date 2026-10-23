import type { DtfPrintPreset, GarmentProduct, GarmentVariant } from "@prisma/client";
import { isGarmentKind } from "@/lib/dtf/dtfConstants";
import type { DtfPresetJson, GarmentProductJson } from "@/lib/dtf/dtfDto";
import type { DtfPresetOption } from "@/lib/dtf/dtfLineCalc";
import { parseGarmentPriceTiers } from "@/lib/dtf/garmentPriceTiers";
import { effectiveUnitCost } from "@/lib/stock/effectiveUnitCost";

export function toDtfPresetOption(p: DtfPrintPreset): DtfPresetOption {
  return {
    id: p.id,
    label: p.label,
    widthCm: Number(p.widthCm),
    heightCm: Number(p.heightCm),
    retailPrice: Number(p.retailPrice),
    dealerPrice: p.dealerPrice == null ? null : Number(p.dealerPrice),
  };
}

export function toDtfPresetJson(p: DtfPrintPreset): DtfPresetJson {
  return { ...toDtfPresetOption(p), isActive: p.isActive, sortOrder: p.sortOrder };
}

export function toGarmentProductJson(
  p: GarmentProduct & { variants: GarmentVariant[] },
): GarmentProductJson {
  return {
    id: p.id,
    kind: isGarmentKind(p.kind) ? p.kind : "other",
    name: p.name,
    colorName: p.colorName,
    colorHex: p.colorHex,
    priceTiers: parseGarmentPriceTiers(p.priceTiers),
    purchaseCost: p.purchaseCost == null ? null : Number(p.purchaseCost),
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    internalNotes: p.internalNotes,
    variants: [...p.variants]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.size.localeCompare(b.size))
      .map((v) => ({
        id: v.id,
        size: v.size,
        sortOrder: v.sortOrder,
        stockQuantity: v.stockQuantity,
        unitCostMdl: effectiveUnitCost(v.avgPurchaseCost, p.purchaseCost),
      })),
  };
}
