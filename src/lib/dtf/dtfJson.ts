import type { DtfPrintPreset } from "@prisma/client";
import type { DtfPresetJson } from "@/lib/dtf/dtfDto";
import type { DtfPresetOption } from "@/lib/dtf/dtfLineCalc";

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

