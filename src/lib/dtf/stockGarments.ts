import type { GarmentKind } from "@/lib/dtf/dtfConstants";
import type { DtfGarmentJson, DtfGarmentSizeJson, DtfLocalizedNames } from "@/lib/dtf/dtfDto";
import { parseGarmentPriceTiers, type GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import { DEFAULT_LOCALE } from "@/lib/i18n/types";

/**
 * DTF garments from the unified stock (docs/UNIFIED-STOCK-PLAN.md): a garment
 * is one `StockItem` in one colour from a category printable with DTF; its
 * sizes are that colour's active `StockVariant`s. Pure — the DB loaders map
 * Prisma rows into {@link DtfStockItemRow} first.
 */

/** `StockCategory.printMethods` entry that makes a category printable with DTF. */
export const DTF_PRINT_METHOD = "dtf";

/** Size label for a variant without `options.size` (one-size items). */
export const DTF_ONE_SIZE = "—";

const GARMENT_ID_SEPARATOR = ":";

type DecimalLike = number | { toString(): string } | null | undefined;

export interface DtfStockVariantRow {
  id: string;
  label: string | null;
  options: unknown;
  sortOrder: number;
  isActive: boolean;
  stockQuantity: DecimalLike;
  avgCost: DecimalLike;
  purchaseCost: DecimalLike;
  sellPrice: DecimalLike;
  priceTiers: unknown;
}

export interface DtfStockItemRow {
  id: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  category: {
    code: string;
    nameRo: string;
    nameRu: string;
    nameEn: string;
    sortOrder: number;
    isActive: boolean;
    printMethods: readonly string[];
  };
  variants: readonly DtfStockVariantRow[];
}

function toNumber(value: DecimalLike): number | null {
  if (value == null) return null;
  const n: number = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

function optionString(options: unknown, key: "color" | "colorHex" | "size"): string {
  if (options == null || typeof options !== "object" || Array.isArray(options)) return "";
  const v: unknown = (options as Record<string, unknown>)[key];
  return typeof v === "string" ? v.trim() : "";
}

/** Grouping key of a colour (case-insensitive, same as the stock variant grid). */
export function dtfColorKey(color: string): string {
  return color.trim().toLowerCase();
}

/** Picker / snapshot id of an item colour: `<stockItemId>:<colorKey>`. */
export function dtfGarmentId(stockItemId: string, colorKey: string): string {
  return `${stockItemId}${GARMENT_ID_SEPARATOR}${colorKey}`;
}

/** Inverse of {@link dtfGarmentId}; null for legacy (`GarmentProduct.id`) ids. */
export function parseDtfGarmentId(id: string): { stockItemId: string; colorKey: string } | null {
  const at: number = id.indexOf(GARMENT_ID_SEPARATOR);
  if (at <= 0) return null;
  return { stockItemId: id.slice(0, at), colorKey: id.slice(at + 1) };
}

/** Garment family shown on the order and the workshop board, from the stock category. */
export function garmentKindForCategory(code: string): GarmentKind {
  switch (code) {
    case "tshirts":
      return "tshirt";
    case "socks":
      return "socks";
    case "bodysuits":
      return "bodysuit";
    default:
      return "other";
  }
}

export function isDtfPrintableCategory(category: {
  isActive: boolean;
  printMethods: readonly string[];
}): boolean {
  return category.isActive && category.printMethods.includes(DTF_PRINT_METHOD);
}

/** Variant run-size prices; without tiers the retail `sellPrice` applies from one piece. */
export function dtfVariantPriceTiers(priceTiers: unknown, sellPrice: DecimalLike): GarmentPriceTier[] {
  const tiers: GarmentPriceTier[] = parseGarmentPriceTiers(priceTiers);
  if (tiers.length > 0) return tiers;
  const price: number | null = toNumber(sellPrice);
  return price != null && price >= 0 ? [{ minQty: 1, priceMdl: price }] : [];
}

/** Name in the UI language, falling back to whichever translation is filled in. */
export function localizedDtfName(names: DtfLocalizedNames, locale: string): string {
  const preferred: string = locale === "ru" ? names.ru : locale === "en" ? names.en : names.ro;
  return preferred.trim() || names.ro.trim() || names.ru.trim() || names.en.trim();
}

function namesOf(row: { nameRo: string; nameRu: string; nameEn: string }): DtfLocalizedNames {
  return { ro: row.nameRo, ru: row.nameRu, en: row.nameEn };
}

function toSize(v: DtfStockVariantRow): DtfGarmentSizeJson {
  const avg: number | null = toNumber(v.avgCost);
  const hint: number | null = toNumber(v.purchaseCost);
  const unit: number | null = avg ?? hint;
  return {
    id: v.id,
    size: optionString(v.options, "size") || v.label?.trim() || DTF_ONE_SIZE,
    sortOrder: v.sortOrder,
    stockQuantity: toNumber(v.stockQuantity) ?? 0,
    unitCostMdl: unit == null ? null : Math.round(unit * 100) / 100,
    priceTiers: dtfVariantPriceTiers(v.priceTiers, v.sellPrice),
  };
}

/** Garments (item × colour) of one stock item; empty when the item is not printable. */
export function dtfGarmentsFromStockItem(item: DtfStockItemRow): DtfGarmentJson[] {
  if (!item.isActive || !isDtfPrintableCategory(item.category)) return [];
  const variants: DtfStockVariantRow[] = item.variants
    .filter((v) => v.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const byColor = new Map<string, DtfGarmentJson>();
  for (const v of variants) {
    const color: string = optionString(v.options, "color");
    const key: string = dtfColorKey(color);
    let garment: DtfGarmentJson | undefined = byColor.get(key);
    if (!garment) {
      const itemNames: DtfLocalizedNames = namesOf(item);
      garment = {
        id: dtfGarmentId(item.id, key),
        stockItemId: item.id,
        categoryCode: item.category.code,
        categoryNames: namesOf(item.category),
        itemNames,
        kind: garmentKindForCategory(item.category.code),
        name: localizedDtfName(itemNames, DEFAULT_LOCALE),
        colorName: color,
        colorHex: null,
        variants: [],
      };
      byColor.set(key, garment);
    }
    garment.colorHex ??= optionString(v.options, "colorHex") || null;
    const size: DtfGarmentSizeJson = toSize(v);
    // Two variants with the same size in one colour cannot be told apart in the editor.
    if (!garment.variants.some((s) => s.size.toUpperCase() === size.size.toUpperCase())) {
      garment.variants.push(size);
    }
  }
  return [...byColor.values()];
}

/** Every DTF garment, by category, item and colour order. */
export function dtfGarmentsFromStockItems(items: readonly DtfStockItemRow[]): DtfGarmentJson[] {
  return [...items]
    .sort(
      (a, b) =>
        a.category.sortOrder - b.category.sortOrder ||
        a.category.code.localeCompare(b.category.code) ||
        a.sortOrder - b.sortOrder ||
        a.nameRo.localeCompare(b.nameRo),
    )
    .flatMap(dtfGarmentsFromStockItem);
}
