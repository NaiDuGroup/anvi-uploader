import type { GarmentKind } from "@/lib/dtf/dtfConstants";
import type { DtfGarmentJson, DtfGarmentSizeJson, DtfLocalizedNames } from "@/lib/dtf/dtfDto";
import type { DtfIncludedPrint } from "@/lib/dtf/dtfLineCalc";
import { parseGarmentPriceTiers, type GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import { DEFAULT_LOCALE } from "@/lib/i18n/types";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { itemPrintsWith } from "@/lib/stock/unified/printMethods";

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
  /** Dealer price per piece (fixed, no run-size steps). */
  dealerPrice?: DecimalLike;
  priceTiers: unknown;
}

export interface DtfStockItemRow {
  id: string;
  /** Item's own print methods; empty = the category's. */
  printMethods?: readonly string[] | null;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  /** Storage key of the item photo (catalog/stock/...). */
  imageUrl?: string | null;
  /** `StockItem.attributes` (reads the DTF print included in the price). */
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
    case "caps":
      return "cap";
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

/** `StockItem.attributes` keys of the DTF print size included in the item price. */
export const DTF_INCLUDED_PRINT_WIDTH_KEY = "dtfIncludedPrintWidthCm";
export const DTF_INCLUDED_PRINT_HEIGHT_KEY = "dtfIncludedPrintHeightCm";

/**
 * Print included in an item's price by kind — only where the studio price
 * list sells the item as a set with a print: a logo on caps and socks.
 * Everything else (T-shirts, bags, toys, polos…) is the bare item plus the print.
 */
const LOGO_PRINT: DtfIncludedPrint = { widthCm: 10, heightCm: 10 };

function kindIncludedPrint(kind: GarmentKind): DtfIncludedPrint | null {
  if (kind === "cap" || kind === "socks") return LOGO_PRINT;
  return null;
}

function positiveNumber(value: unknown): number | null {
  const n: number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Print already in the item price (studio price list: «Tricou (A4)», «Chipiu»,
 * «Ciorapi»): the item's own size (both attributes set; 0 = sold without a
 * print), else its kind's standard — a logo on caps and socks (sold as a set,
 * «Chipiu» / «Ciorapi»), none on other items: a T-shirt is the bare item plus
 * the print by the list (100 + A4 180 = «Tricou (A4)» 280).
 */
export function dtfIncludedPrintFor(attributes: unknown, kind: GarmentKind): DtfIncludedPrint | null {
  if (attributes != null && typeof attributes === "object" && !Array.isArray(attributes)) {
    const a = attributes as Record<string, unknown>;
    if (DTF_INCLUDED_PRINT_WIDTH_KEY in a || DTF_INCLUDED_PRINT_HEIGHT_KEY in a) {
      const w: number | null = positiveNumber(a[DTF_INCLUDED_PRINT_WIDTH_KEY]);
      const h: number | null = positiveNumber(a[DTF_INCLUDED_PRINT_HEIGHT_KEY]);
      return w != null && h != null ? { widthCm: w, heightCm: h } : null;
    }
  }
  return kindIncludedPrint(kind);
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
  const dealer: number | null = toNumber(v.dealerPrice);
  return {
    id: v.id,
    size: optionString(v.options, "size") || v.label?.trim() || DTF_ONE_SIZE,
    sortOrder: v.sortOrder,
    stockQuantity: toNumber(v.stockQuantity) ?? 0,
    unitCostMdl: unit == null ? null : Math.round(unit * 100) / 100,
    priceTiers: dtfVariantPriceTiers(v.priceTiers, v.sellPrice),
    dealerPriceMdl: dealer != null && dealer >= 0 ? dealer : null,
  };
}

/** Garments (item × colour) of one stock item; empty when the item is not printable. */
export function dtfGarmentsFromStockItem(item: DtfStockItemRow): DtfGarmentJson[] {
  if (!itemPrintsWith(item, DTF_PRINT_METHOD)) return [];
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
      const kind: GarmentKind = garmentKindForCategory(item.category.code);
      garment = {
        id: dtfGarmentId(item.id, key),
        stockItemId: item.id,
        categoryCode: item.category.code,
        categoryNames: namesOf(item.category),
        itemNames,
        kind,
        name: localizedDtfName(itemNames, DEFAULT_LOCALE),
        colorName: color,
        colorHex: null,
        imageUrl: publicAssetUrlFromStorageKey(item.imageUrl),
        includedPrint: dtfIncludedPrintFor(item.attributes, kind),
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
