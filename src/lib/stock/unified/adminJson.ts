import type { Prisma } from "@prisma/client";
import { parseGarmentPriceTiers, type GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { isStockCategoryKind, isStockUnit, StockCategoryKind, StockUnit } from "./kinds";
import {
  itemStockSummary,
  type StockCategoryJson,
  type StockItemJson,
  type StockMovementJson,
  type StockReceiptJson,
  type StockVariantJson,
} from "./adminTypes";
import { parsePrintMethods } from "./printMethods";
import type { VariantOptions } from "./variantGrid";

/** Prisma rows → JSON for `/api/admin/stock/**` (Decimals as numbers, image keys as public URLs). */

function num(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value.toString());
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asOptions(value: Prisma.JsonValue): VariantOptions {
  const r: Record<string, unknown> = asRecord(value);
  const out: VariantOptions = {};
  if (typeof r.color === "string" && r.color) out.color = r.color;
  if (typeof r.colorHex === "string" && r.colorHex) out.colorHex = r.colorHex;
  if (typeof r.size === "string" && r.size) out.size = r.size;
  return out;
}

/** Stored tiers, or null when unset / empty / unreadable. */
function asPriceTiers(value: Prisma.JsonValue | null): GarmentPriceTier[] | null {
  if (value == null) return null;
  const tiers: GarmentPriceTier[] = parseGarmentPriceTiers(value);
  return tiers.length > 0 ? tiers : null;
}

type UserName = { name: string; displayName: string | null } | null;

function userName(u: UserName): string | null {
  return u ? u.displayName ?? u.name : null;
}

export const STOCK_USER_NAME_SELECT = { select: { name: true, displayName: true } } as const;

export function toStockCategoryJson(
  row: Prisma.StockCategoryGetPayload<object>,
  itemCount: number,
): StockCategoryJson {
  return {
    id: row.id,
    code: row.code,
    kind: isStockCategoryKind(row.kind) ? row.kind : StockCategoryKind.Product,
    nameRo: row.nameRo,
    nameRu: row.nameRu,
    nameEn: row.nameEn,
    unit: isStockUnit(row.unit) ? row.unit : StockUnit.Pieces,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    printMethods: parsePrintMethods(row.printMethods),
    itemCount,
  };
}

export function toStockVariantJson(row: Prisma.StockVariantGetPayload<object>): StockVariantJson {
  return {
    id: row.id,
    itemId: row.itemId,
    sku: row.sku,
    label: row.label,
    options: asOptions(row.options),
    stockQuantity: num(row.stockQuantity) ?? 0,
    avgCost: num(row.avgCost),
    purchaseCost: num(row.purchaseCost),
    sellPrice: num(row.sellPrice),
    dealerPrice: num(row.dealerPrice),
    reorderLevel: num(row.reorderLevel),
    priceTiers: asPriceTiers(row.priceTiers),
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const STOCK_VARIANTS_ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

export function toStockItemJson(
  row: Prisma.StockItemGetPayload<{ include: { variants: true } }>,
): StockItemJson {
  const variants: StockVariantJson[] = row.variants.map(toStockVariantJson);
  const summary = itemStockSummary(variants);
  return {
    id: row.id,
    categoryId: row.categoryId,
    sku: row.sku,
    nameRo: row.nameRo,
    nameRu: row.nameRu,
    nameEn: row.nameEn,
    imageUrl: row.imageUrl,
    imagePublicUrl: publicAssetUrlFromStorageKey(row.imageUrl),
    attributes: asRecord(row.attributes),
    printMethods: parsePrintMethods(row.printMethods),
    isSellable: row.isSellable,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    internalNotes: row.internalNotes,
    updatedAt: row.updatedAt.toISOString(),
    variants,
    totalStock: summary.totalStock,
    avgCost: summary.avgCost,
  };
}

export function toStockReceiptJson(
  row: Prisma.StockReceiptGetPayload<{
    include: {
      variant: { select: { sku: true; label: true } };
      createdBy: typeof STOCK_USER_NAME_SELECT;
    };
  }>,
): StockReceiptJson {
  const quantity: number = num(row.quantity) ?? 0;
  const total: number = num(row.totalCostMdl) ?? 0;
  return {
    id: row.id,
    variantId: row.variantId,
    variantSku: row.variant.sku,
    variantLabel: row.variant.label,
    quantity,
    totalCostMdl: total,
    unitCostMdl: quantity > 0 ? Math.round((total / quantity) * 10000) / 10000 : 0,
    purchasedAt: row.purchasedAt.toISOString().slice(0, 10),
    supplierName: row.supplierName,
    note: row.note,
    isProvisional: row.isProvisional,
    fromInvoice: row.purchaseInvoiceLineId != null,
    createdAt: row.createdAt.toISOString(),
    createdByName: userName(row.createdBy),
  };
}

export function toStockMovementJson(
  row: Prisma.StockMovementGetPayload<{ include: { createdBy: typeof STOCK_USER_NAME_SELECT } }>,
): StockMovementJson {
  return {
    id: row.id,
    kind: row.kind,
    delta: num(row.delta) ?? 0,
    costMdl: num(row.costMdl),
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    receiptId: row.receiptId,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    createdByName: userName(row.createdBy),
  };
}
