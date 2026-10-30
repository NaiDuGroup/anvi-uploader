import type { StockVariantJson } from "@/lib/stock/unified/adminTypes";

/**
 * The unified stock variant of a roll / paper row as the generic stock modals
 * (stocktake, write-off, history) expect it. Rolls and papers keep their own
 * catalog screens; balance and cost come from the variant.
 */
export function materialStockVariantJson(row: {
  stockVariantId: string | null;
  stockSku: string | null;
  stockQuantity: number;
  avgCost: number | null;
  purchaseCost: number | null;
  isActive: boolean;
}): StockVariantJson | null {
  if (!row.stockVariantId) return null;
  return {
    id: row.stockVariantId,
    itemId: "",
    sku: row.stockSku ?? "",
    label: null,
    supplierCode: null,
    options: {},
    stockQuantity: row.stockQuantity,
    avgCost: row.avgCost,
    purchaseCost: row.purchaseCost,
    sellPrice: null,
    dealerPrice: null,
    reorderLevel: null,
    priceTiers: null,
    sortOrder: 0,
    isActive: row.isActive,
    updatedAt: "",
  };
}
