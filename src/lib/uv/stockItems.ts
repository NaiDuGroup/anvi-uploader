import { dtfVariantPriceTiers, localizedDtfName } from "@/lib/dtf/stockGarments";
import { DEFAULT_LOCALE } from "@/lib/i18n/types";
import { UV_PRINT_METHOD } from "@/lib/uv/uvConstants";
import type { UvLocalizedNames, UvStockItemJson } from "@/lib/uv/dto";
import type { UvItemSnapshot } from "@/lib/uv/types";
import type { UvPrintArea } from "@/lib/uv/uvLineCalc";
import { parseUvPrintNorms, type UvPrintNorms } from "@/lib/uv/uvPrintNorms";

/**
 * UV stock items from the unified stock: every active variant of an active item
 * in a category printable with UV (`printMethods` contains "uv"). Pure — the
 * DB loaders map Prisma rows into {@link UvStockItemRow} first.
 */

export type DecimalLike = number | { toString(): string } | null | undefined;

export interface UvStockVariantRow {
  id: string;
  sku: string;
  label: string | null;
  options: unknown;
  sortOrder: number;
  isActive: boolean;
  stockQuantity: DecimalLike;
  avgCost: DecimalLike;
  purchaseCost: DecimalLike;
  sellPrice: DecimalLike;
  priceTiers: unknown;
  /** Dealer price per piece (print included); null = dealers pay the retail tier. */
  dealerPrice?: DecimalLike;
}

export interface UvStockItemRow {
  id: string;
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  /** Category details; pens / notebooks keep their print area here (`printWidthCm`, `printHeightCm`). */
  attributes?: unknown;
  category: {
    code: string;
    nameRo: string;
    nameRu: string;
    nameEn: string;
    sortOrder: number;
    isActive: boolean;
    printMethods: readonly string[];
  };
  variants: readonly UvStockVariantRow[];
}

export function toNumber(value: DecimalLike): number | null {
  if (value == null) return null;
  const n: number = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

function optionString(options: unknown, key: "color" | "colorHex" | "size"): string {
  if (options == null || typeof options !== "object" || Array.isArray(options)) return "";
  const v: unknown = (options as Record<string, unknown>)[key];
  return typeof v === "string" ? v.trim() : "";
}

function attributeNumber(attributes: unknown, key: string): number | null {
  if (attributes == null || typeof attributes !== "object" || Array.isArray(attributes)) return null;
  const v: unknown = (attributes as Record<string, unknown>)[key];
  const n: number = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** «Параметры печати» of a stock item: print width × height in cm, or null when either is missing. */
export function stockItemPrintArea(attributes: unknown): UvPrintArea | null {
  const widthCm: number | null = attributeNumber(attributes, "printWidthCm");
  const heightCm: number | null = attributeNumber(attributes, "printHeightCm");
  return widthCm != null && heightCm != null ? { widthCm, heightCm } : null;
}

function namesOf(row: { nameRo: string; nameRu: string; nameEn: string }): UvLocalizedNames {
  return { ro: row.nameRo, ru: row.nameRu, en: row.nameEn };
}

export function isUvPrintableCategory(category: { isActive: boolean; printMethods: readonly string[] }): boolean {
  return isPrintableCategory(category, UV_PRINT_METHOD);
}

/** Active category marked with the print method (`printMethods` contains it). */
export function isPrintableCategory(
  category: { isActive: boolean; printMethods: readonly string[] },
  method: string,
): boolean {
  return category.isActive && category.printMethods.includes(method);
}

/** «Красный / M», the variant label, or null for a single unnamed variant. */
export function uvVariantLabel(v: Pick<UvStockVariantRow, "label" | "options">): string | null {
  const parts: string[] = [optionString(v.options, "color"), optionString(v.options, "size")].filter((p) => p);
  if (parts.length > 0) return parts.join(" / ");
  return v.label?.trim() || null;
}

/** Active variants of one stock item; empty when the item or its category is not printable. */
export function uvStockItemsFromStockItem(item: UvStockItemRow): UvStockItemJson[] {
  return printableStockItemsFromStockItem(item, UV_PRINT_METHOD);
}

/** Active variants of one stock item printable with `method` (UV, sublimation). */
export function printableStockItemsFromStockItem(item: UvStockItemRow, method: string): UvStockItemJson[] {
  if (!item.isActive || !isPrintableCategory(item.category, method)) return [];
  const itemNames: UvLocalizedNames = namesOf(item);
  const categoryNames: UvLocalizedNames = namesOf(item.category);
  const printArea: UvPrintArea | null = stockItemPrintArea(item.attributes);
  const printNorms: UvPrintNorms = parseUvPrintNorms(item.attributes);
  return item.variants
    .filter((v) => v.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v): UvStockItemJson => {
      const unit: number | null = toNumber(v.avgCost) ?? toNumber(v.purchaseCost);
      const dealer: number | null = toNumber(v.dealerPrice);
      return {
        id: v.id,
        itemId: item.id,
        categoryCode: item.category.code,
        categoryNames,
        itemNames,
        name: localizedDtfName(itemNames, DEFAULT_LOCALE),
        sku: v.sku,
        variantLabel: uvVariantLabel(v),
        colorHex: optionString(v.options, "colorHex") || null,
        stockQuantity: toNumber(v.stockQuantity) ?? 0,
        unitCostMdl: unit == null ? null : Math.round(unit * 100) / 100,
        priceTiers: dtfVariantPriceTiers(v.priceTiers, v.sellPrice),
        dealerPriceMdl: dealer != null && dealer >= 0 ? dealer : null,
        printArea,
        printNorms,
      };
    });
}

/** Every UV stock item, by category, item and variant order. */
export function uvStockItemsFromStockItems(items: readonly UvStockItemRow[]): UvStockItemJson[] {
  return printableStockItemsFromStockItems(items, UV_PRINT_METHOD);
}

/** Every stock item printable with `method`, by category, item and variant order. */
export function printableStockItemsFromStockItems(items: readonly UvStockItemRow[], method: string): UvStockItemJson[] {
  return [...items]
    .sort(
      (a, b) =>
        a.category.sortOrder - b.category.sortOrder ||
        a.category.code.localeCompare(b.category.code) ||
        a.sortOrder - b.sortOrder ||
        a.nameRo.localeCompare(b.nameRo),
    )
    .flatMap((item) => printableStockItemsFromStockItem(item, method));
}

export function uvItemSnapshot(item: UvStockItemJson): UvItemSnapshot {
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

/** Item name in the UI language with the variant, e.g. «Ручка белая · Красный». */
export function uvItemDisplayName(
  item: Pick<UvItemSnapshot, "name" | "names" | "variantLabel">,
  locale: string,
): string {
  const name: string = localizedDtfName(item.names, locale) || item.name;
  return [name, item.variantLabel].filter((p) => p).join(" · ");
}
