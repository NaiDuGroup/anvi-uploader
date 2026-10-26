import { Prisma, type PrintPricePreset } from "@prisma/client";
import type {
  PrintPresetInput,
  PrintPresetJson,
  PrintPresetOption,
  PrintPresetPatch,
} from "@/lib/printMethods/presets";

/** `PrintPricePreset` rows ↔ plain numbers (server only: uses Prisma.Decimal). */
export function toPrintPresetOption(p: PrintPricePreset): PrintPresetOption {
  return {
    id: p.id,
    label: p.label,
    widthCm: Number(p.widthCm),
    heightCm: Number(p.heightCm),
    retailPrice: Number(p.retailPrice),
    dealerPrice: p.dealerPrice == null ? null : Number(p.dealerPrice),
  };
}

export function toPrintPresetJson(p: PrintPricePreset): PrintPresetJson {
  return { ...toPrintPresetOption(p), isActive: p.isActive, sortOrder: p.sortOrder };
}

const money2 = (n: number): Prisma.Decimal => new Prisma.Decimal(n.toFixed(2));

/** Row data for a new preset of `methodCode`. */
export function printPresetCreateData(
  methodCode: string,
  input: PrintPresetInput,
): Prisma.PrintPricePresetUncheckedCreateInput {
  return {
    methodCode,
    label: input.label,
    widthCm: new Prisma.Decimal(input.widthCm),
    heightCm: new Prisma.Decimal(input.heightCm),
    retailPrice: money2(input.retailPrice),
    dealerPrice: input.dealerPrice == null ? null : money2(input.dealerPrice),
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
  };
}

/** Row update for a preset patch (absent keys stay; `dealerPrice: null` clears it). */
export function printPresetUpdateData(input: PrintPresetPatch): Prisma.PrintPricePresetUpdateManyMutationInput {
  return {
    label: input.label,
    widthCm: input.widthCm == null ? undefined : new Prisma.Decimal(input.widthCm),
    heightCm: input.heightCm == null ? undefined : new Prisma.Decimal(input.heightCm),
    retailPrice: input.retailPrice == null ? undefined : money2(input.retailPrice),
    dealerPrice:
      input.dealerPrice === undefined ? undefined : input.dealerPrice === null ? null : money2(input.dealerPrice),
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}
