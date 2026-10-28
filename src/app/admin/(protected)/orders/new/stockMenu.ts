/**
 * Admin order editor: the product menu lists stock categories (Кружки,
 * Блокноты, Одежда, …) next to the printing services, so the operator picks
 * «what» and the print method follows from the item. Pure — the editor and the
 * tests share it.
 *
 * Under the hood the rows stay the same order lines: a UV item → `uv_print`
 * (or the pen / notebook designer line), a sublimation blank → `sublimation_print`
 * (or the mug line), a DTF garment → `dtf_apparel`.
 */
import type { DtfCatalogJson, DtfGarmentJson } from "@/lib/dtf/dtfDto";
import { localizedDtfName } from "@/lib/dtf/stockGarments";
import type { UvLocalizedNames, UvStockItemJson } from "@/lib/uv/dto";
import type { StockPickerItem } from "@/app/admin/_components/uv/StockItemPickerModal";

/** Print-method order lines a stock item can become. */
export type StockMethod = "uv_print" | "sublimation_print" | "dtf_apparel";

export const STOCK_METHODS: readonly StockMethod[] = ["uv_print", "sublimation_print", "dtf_apparel"];

/** One pickable stock item with every print method it can be printed with (first = default). */
export interface StockMenuEntry extends StockPickerItem {
  methods: StockMethod[];
}

export interface StockMenuCategory {
  code: string;
  names: UvLocalizedNames;
  count: number;
  /** Photo of the first item that has one (menu tile preview). */
  imageUrl: string | null;
}

function garmentEntry(g: DtfGarmentJson): StockMenuEntry {
  const sizes: string[] = g.variants.map((v) => v.size);
  const stock: number = g.variants.reduce((s, v) => s + Math.max(0, v.stockQuantity), 0);
  const tiers = [...g.variants]
    .map((v) => v.priceTiers)
    .filter((t) => t.length > 0)
    .sort((a, b) => (a[0]?.priceMdl ?? 0) - (b[0]?.priceMdl ?? 0))[0];
  return {
    id: g.id,
    categoryCode: g.categoryCode,
    categoryNames: g.categoryNames,
    itemNames: g.itemNames,
    // «Свитшот ESTAMBUL чёрный» already names its colour.
    variantLabel:
      g.colorName && !g.itemNames.ru.toLowerCase().includes(g.colorName.toLowerCase()) ? g.colorName : null,
    colorHex: g.colorHex,
    imageUrl: g.imageUrl ?? null,
    sku: sizes.join(" · "),
    stockQuantity: stock,
    priceTiers: tiers ?? [],
    printArea: null,
    methods: ["dtf_apparel"],
  };
}

function itemEntry(item: UvStockItemJson, method: StockMethod): StockMenuEntry {
  return {
    id: item.id,
    categoryCode: item.categoryCode,
    categoryNames: item.categoryNames,
    itemNames: item.itemNames,
    variantLabel: item.variantLabel,
    colorHex: item.colorHex,
    imageUrl: item.imageUrl,
    sku: item.sku,
    stockQuantity: item.stockQuantity,
    priceTiers: item.priceTiers,
    printArea: method === "uv_print" ? item.printArea : null,
    methods: [method],
  };
}

/**
 * Every stock item of the three print methods, in category order (sublimation,
 * UV, then DTF within the catalogs' own order). A variant printable with both
 * UV and sublimation appears once, with both methods.
 */
export function buildStockMenuEntries(catalogs: {
  uv: readonly UvStockItemJson[];
  sublimation: readonly UvStockItemJson[];
  dtf: DtfCatalogJson["garments"];
}): StockMenuEntry[] {
  const byId = new Map<string, StockMenuEntry>();
  const order: StockMenuEntry[] = [];
  const add = (entry: StockMenuEntry): void => {
    const seen = byId.get(entry.id);
    if (seen) {
      for (const m of entry.methods) if (!seen.methods.includes(m)) seen.methods.push(m);
      return;
    }
    byId.set(entry.id, entry);
    order.push(entry);
  };
  for (const item of catalogs.sublimation) add(itemEntry(item, "sublimation_print"));
  for (const item of catalogs.uv) add(itemEntry(item, "uv_print"));
  for (const g of catalogs.dtf) add(garmentEntry(g));
  // Keep one category together even when its items come from several catalogs (UV mugs in «Кружки»).
  const categoryRank = new Map<string, number>();
  order.forEach((e) => {
    if (!categoryRank.has(e.categoryCode)) categoryRank.set(e.categoryCode, categoryRank.size);
  });
  return order
    .map((e, i) => ({ e, i }))
    .sort((a, b) => categoryRank.get(a.e.categoryCode)! - categoryRank.get(b.e.categoryCode)! || a.i - b.i)
    .map(({ e }) => e);
}

/** Menu tiles: one per category that has items, in entry order. */
export function stockMenuCategories(entries: readonly StockMenuEntry[]): StockMenuCategory[] {
  const byCode = new Map<string, StockMenuCategory>();
  for (const e of entries) {
    const c = byCode.get(e.categoryCode);
    if (c) {
      c.count += 1;
      c.imageUrl ??= e.imageUrl;
    } else {
      byCode.set(e.categoryCode, { code: e.categoryCode, names: e.categoryNames, count: 1, imageUrl: e.imageUrl });
    }
  }
  return [...byCode.values()];
}

export function stockCategoryName(category: Pick<StockMenuCategory, "names">, locale: string): string {
  return localizedDtfName(category.names, locale);
}

/** What a row currently is, in menu terms. */
export type RowMenuState =
  | { kind: "stock"; entry: StockMenuEntry; method: StockMethod }
  | { kind: "client"; method: StockMethod }
  | { kind: "other" };

/** The minimal row shape the menu reads. */
export interface RowMenuInput {
  productType: string;
  uv?: { source: "stock" | "client"; variantId: string | null } | null;
  sublimation?: { source?: "stock" | "client"; variantId: string | null } | null;
  dtf?: { garmentSource: "stock" | "client"; garmentProductId: string | null } | null;
  /** Stock variant of a pen / notebook / mug designer row. */
  designerVariantId?: string | null;
}

const DESIGNER_METHOD: Readonly<Record<string, StockMethod>> = {
  pen: "uv_print",
  notebook: "uv_print",
  mug: "sublimation_print",
};

export function rowMenuState(a: RowMenuInput, entries: readonly StockMenuEntry[]): RowMenuState {
  const find = (id: string | null | undefined): StockMenuEntry | undefined =>
    id ? entries.find((e) => e.id === id) : undefined;
  const stock = (id: string | null | undefined, method: StockMethod): RowMenuState => {
    const entry = find(id);
    return entry ? { kind: "stock", entry, method } : { kind: "other" };
  };
  switch (a.productType) {
    case "uv_print":
      return a.uv?.source === "client" ? { kind: "client", method: "uv_print" } : stock(a.uv?.variantId, "uv_print");
    case "sublimation_print":
      return a.sublimation?.source === "client"
        ? { kind: "client", method: "sublimation_print" }
        : stock(a.sublimation?.variantId, "sublimation_print");
    case "dtf_apparel":
      return a.dtf?.garmentSource === "client"
        ? { kind: "client", method: "dtf_apparel" }
        : stock(a.dtf?.garmentProductId, "dtf_apparel");
    default: {
      const method: StockMethod | undefined = DESIGNER_METHOD[a.productType];
      return method ? stock(a.designerVariantId, method) : { kind: "other" };
    }
  }
}
