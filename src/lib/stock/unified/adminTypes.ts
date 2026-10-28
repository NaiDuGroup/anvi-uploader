import type { GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import type { StockCategoryKind, StockUnit } from "./kinds";
import type { PrintMethod } from "./printMethods";
import type { VariantOptions } from "./variantGrid";

/** JSON shapes returned by `/api/admin/stock/**` (client-safe: no Prisma imports). */

export type StockCategoryJson = {
  id: string;
  code: string;
  kind: StockCategoryKind;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  unit: StockUnit;
  sortOrder: number;
  isActive: boolean;
  /** Print processes that use this category's items as blanks («dtf»). */
  printMethods: PrintMethod[];
  itemCount: number;
};

export type StockVariantJson = {
  id: string;
  itemId: string;
  sku: string;
  label: string | null;
  options: VariantOptions;
  stockQuantity: number;
  avgCost: number | null;
  purchaseCost: number | null;
  sellPrice: number | null;
  dealerPrice: number | null;
  reorderLevel: number | null;
  /** Run-size retail prices of printed apparel (sorted, «от 1» first); null when unset. */
  priceTiers: GarmentPriceTier[] | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
};

export type StockItemJson = {
  id: string;
  categoryId: string;
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  imageUrl: string | null;
  imagePublicUrl: string | null;
  attributes: Record<string, unknown>;
  /** Own print methods; empty = the category's. */
  printMethods: PrintMethod[];
  isSellable: boolean;
  isActive: boolean;
  sortOrder: number;
  internalNotes: string | null;
  updatedAt: string;
  variants: StockVariantJson[];
  totalStock: number;
  avgCost: number | null;
};

export type StockReceiptJson = {
  id: string;
  variantId: string;
  variantSku: string;
  variantLabel: string | null;
  quantity: number;
  totalCostMdl: number;
  unitCostMdl: number;
  purchasedAt: string;
  supplierName: string | null;
  note: string | null;
  isProvisional: boolean;
  fromInvoice: boolean;
  createdAt: string;
  createdByName: string | null;
};

export type StockMovementJson = {
  id: string;
  kind: string;
  delta: number;
  costMdl: number | null;
  orderId: string | null;
  orderNumber: number | null;
  receiptId: string | null;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
};

export type StockMovementsPage = {
  movements: StockMovementJson[];
  total: number;
  page: number;
  pageSize: number;
};

type Named = { nameRo: string; nameRu: string; nameEn: string };

/** Name in the UI language, falling back to whichever translation is filled in. */
export function localizedStockName(row: Named, locale: string): string {
  const preferred: string = locale === "ru" ? row.nameRu : locale === "en" ? row.nameEn : row.nameRo;
  return preferred.trim() || row.nameRo.trim() || row.nameRu.trim() || row.nameEn.trim();
}

type CostedVariant = { stockQuantity: number; avgCost: number | null; purchaseCost: number | null };

/**
 * Item-level totals: stock is the sum over variants; cost is the stock-weighted
 * average of each variant's cost (avg, or the manual hint before the first
 * receipt). With no stock on hand it is the plain mean of the known costs.
 */
export function itemStockSummary(variants: readonly CostedVariant[]): {
  totalStock: number;
  avgCost: number | null;
} {
  let totalStock = 0;
  let weightedQty = 0;
  let weightedSum = 0;
  let plainSum = 0;
  let plainCount = 0;
  for (const v of variants) {
    totalStock += v.stockQuantity;
    const cost: number | null = v.avgCost ?? v.purchaseCost;
    if (cost == null) continue;
    plainSum += cost;
    plainCount += 1;
    if (v.stockQuantity > 0) {
      weightedQty += v.stockQuantity;
      weightedSum += v.stockQuantity * cost;
    }
  }
  totalStock = Math.round(totalStock * 1000) / 1000;
  const avg: number | null =
    weightedQty > 0 ? weightedSum / weightedQty : plainCount > 0 ? plainSum / plainCount : null;
  return { totalStock, avgCost: avg == null ? null : Math.round(avg * 10000) / 10000 };
}
