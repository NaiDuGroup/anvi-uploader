import {
  printableStockItemsFromStockItem,
  printableStockItemsFromStockItems,
  toNumber,
  uvItemDisplayName,
  type UvStockItemRow,
} from "@/lib/uv/stockItems";
import type { UvStockItemJson } from "@/lib/uv/dto";
import type { SublimationStockItemJson } from "@/lib/sublimation/dto";
import { SUBLIMATION_PRINT_METHOD } from "@/lib/sublimation/sublimationConstants";
import type { SublimationItemSnapshot } from "@/lib/sublimation/types";

/**
 * Sublimation blanks from the unified stock: every active variant of an active
 * item in a category marked «sublimation» (mugs, pillows, puzzles, …). Pure —
 * same row shape as the UV loaders, plus the variant dealer price.
 */

function withDealerPrice(item: UvStockItemRow, json: UvStockItemJson): SublimationStockItemJson {
  const variant = item.variants.find((v) => v.id === json.id);
  const dealer: number | null = toNumber(variant?.dealerPrice);
  return { ...json, dealerPriceMdl: dealer != null && dealer >= 0 ? dealer : null };
}

export function sublimationStockItemsFromStockItem(item: UvStockItemRow): SublimationStockItemJson[] {
  return printableStockItemsFromStockItem(item, SUBLIMATION_PRINT_METHOD).map((j) => withDealerPrice(item, j));
}

export function sublimationStockItemsFromStockItems(items: readonly UvStockItemRow[]): SublimationStockItemJson[] {
  const byId = new Map<string, UvStockItemRow>(items.map((i) => [i.id, i]));
  return printableStockItemsFromStockItems(items, SUBLIMATION_PRINT_METHOD).map((j) =>
    withDealerPrice(byId.get(j.itemId)!, j),
  );
}

export function sublimationItemSnapshot(item: SublimationStockItemJson): SublimationItemSnapshot {
  return {
    variantId: item.id,
    itemId: item.itemId,
    categoryCode: item.categoryCode,
    name: item.name,
    names: item.itemNames,
    categoryNames: item.categoryNames,
    sku: item.sku,
    variantLabel: item.variantLabel,
    colorHex: item.colorHex,
  };
}

/** «Подушка · Сатин» in the UI language. */
export const sublimationItemDisplayName = uvItemDisplayName;
