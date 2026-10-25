import { Prisma } from "@prisma/client";
import { sortTiers, type GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import { assertQuantityForUnit, decimalOrNull, decimalPatch } from "./apiRoute";
import type { StockUnit } from "./kinds";
import type { StockVariantInput, StockVariantUpdateBody } from "./schemas";
import { variantLabel, type VariantOptions } from "./variantGrid";

/** Prisma data for new / edited variants. Balance and cost are never written here — only the ledger does that. */

function cleanOptions(options: VariantOptions | undefined): VariantOptions {
  const out: VariantOptions = {};
  if (options?.color) out.color = options.color;
  if (options?.colorHex) out.colorHex = options.colorHex.toLowerCase();
  if (options?.size) out.size = options.size;
  return out;
}

function labelFor(label: string | null | undefined, options: VariantOptions): string | null {
  const explicit: string = label?.trim() ?? "";
  if (explicit) return explicit;
  const auto: string = variantLabel(options);
  return auto || null;
}

/** Tiers as stored: sorted, or SQL NULL when cleared / empty. */
function priceTiersValue(
  tiers: readonly GarmentPriceTier[] | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return tiers && tiers.length > 0 ? (sortTiers(tiers) as Prisma.InputJsonValue) : Prisma.DbNull;
}

export function variantCreateData(
  input: StockVariantInput,
  unit: StockUnit,
  index: number,
): Omit<Prisma.StockVariantUncheckedCreateInput, "itemId"> {
  if (input.reorderLevel != null) assertQuantityForUnit(input.reorderLevel, unit, "reorderLevel", { allowZero: true });
  const options: VariantOptions = cleanOptions(input.options);
  return {
    sku: input.sku,
    label: labelFor(input.label, options),
    options,
    sellPrice: decimalOrNull(input.sellPrice, 2),
    dealerPrice: decimalOrNull(input.dealerPrice, 2),
    purchaseCost: decimalOrNull(input.purchaseCost, 4),
    reorderLevel: decimalOrNull(input.reorderLevel, 3),
    priceTiers: priceTiersValue(input.priceTiers ?? null),
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? index,
  };
}

export function variantUpdateData(
  input: StockVariantUpdateBody,
  unit: StockUnit,
): Prisma.StockVariantUncheckedUpdateInput {
  if (input.reorderLevel != null) assertQuantityForUnit(input.reorderLevel, unit, "reorderLevel", { allowZero: true });
  const data: Prisma.StockVariantUncheckedUpdateInput = {
    sku: input.sku,
    sellPrice: decimalPatch(input.sellPrice, 2),
    dealerPrice: decimalPatch(input.dealerPrice, 2),
    purchaseCost: decimalPatch(input.purchaseCost, 4),
    reorderLevel: decimalPatch(input.reorderLevel, 3),
    priceTiers: input.priceTiers === undefined ? undefined : priceTiersValue(input.priceTiers),
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
  if (input.options !== undefined) {
    const options: VariantOptions = cleanOptions(input.options);
    data.options = options;
    if (input.label === undefined) data.label = labelFor(null, options);
  }
  if (input.label !== undefined) {
    data.label = labelFor(input.label, cleanOptions(input.options));
  }
  return data;
}
