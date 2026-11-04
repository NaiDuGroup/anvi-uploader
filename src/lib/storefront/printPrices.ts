import { cappedTierTotal, tierPriceForQuantity, type GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import { effectiveDpi, SHOP_LOW_DPI } from "./dtfPrint";

/**
 * Storefront photo & document printing («Printare foto și documente», page
 * `/printare`): the price list, the line shape and the price of a line.
 * ONE module for the page's live price, the cart re-quote
 * (`POST /api/public/quote`) and the checkout (the server re-prices from
 * here; the client total is never read). Pure, client-safe.
 *
 * Source: `docs/storefront-prices-draft.md` (the studio price list PDF,
 * page 6 — documents, page 9 — photos). Prod `sheet_papers.retail_price_per_sheet`
 * is 0, so the PDF is the only source. Values marked `GUESS` are not in the
 * price list and wait for the owner's approval (questions 6 and 7 of the draft).
 */

export const SHOP_PRINT_SLUG = "printare";

/** Files (positions) in one print cart line / order line. */
export const SHOP_PRINT_MAX_FILES = 50;
export const SHOP_PRINT_MAX_COPIES = 1000;
/** Pages of one document file. */
export const SHOP_PRINT_MAX_PAGES = 5000;
/** Above this a file is slow to upload (and its pages are not counted in the browser): the page warns. */
export const SHOP_PRINT_BIG_FILE_BYTES = 200 * 1024 * 1024;

export type ShopPrintMode = "doc" | "photo";
export const SHOP_PRINT_MODES: readonly ShopPrintMode[] = ["doc", "photo"];

// ─── Documents (PDF page 6) ──────────────────────────────────────────────────

export const SHOP_DOC_FORMATS = ["A4", "A3"] as const;
export type ShopDocFormat = (typeof SHOP_DOC_FORMATS)[number];
export const SHOP_PRINT_COLORS = ["bw", "color"] as const;
export type ShopPrintColor = (typeof SHOP_PRINT_COLORS)[number];
export const SHOP_PRINT_SIDES = ["one", "two"] as const;
export type ShopPrintSides = (typeof SHOP_PRINT_SIDES)[number];

/**
 * Lei per sheet on plain 80 g paper: `one` = one printed side, `two` = one
 * duplex sheet (both sides). Run-size tiers: `minQty` = printed sheets of the
 * same format / colour / sides in the line. One tier = one price at every
 * quantity (the price list has no quantity discounts — GUESS: none).
 * A bigger run is never cheaper than a smaller one: `cappedTierTotal`.
 */
export const SHOP_DOC_PRICES: Record<ShopDocFormat, Record<ShopPrintColor, Record<ShopPrintSides, GarmentPriceTier[]>>> = {
  A4: {
    // PDF 6: «Xerox» b/w A4 2 lei, duplex 4. Same price when printed from a file — GUESS (draft question 6).
    bw: { one: [{ minQty: 1, priceMdl: 2 }], two: [{ minQty: 1, priceMdl: 4 }] },
    // PDF 6: colour A4 80 g 5 lei. Duplex is not in the list — GUESS: 2 × one side = 10.
    color: { one: [{ minQty: 1, priceMdl: 5 }], two: [{ minQty: 1, priceMdl: 10 }] },
  },
  A3: {
    // PDF 6: b/w A3 4 lei, duplex 8.
    bw: { one: [{ minQty: 1, priceMdl: 4 }], two: [{ minQty: 1, priceMdl: 8 }] },
    // PDF 6: colour A3 80 g 10 lei. Duplex — GUESS: 2 × one side = 20.
    color: { one: [{ minQty: 1, priceMdl: 10 }], two: [{ minQty: 1, priceMdl: 20 }] },
  },
};
// Not offered online (not in the list or not self-serve): A5 (GUESS: no A5 price), heavier /
// textured paper (PDF 6 has them for colour only), stapling, binding (PDF 8: «Брошюровка» 25–80 lei by
// thickness — left out: it needs the sheet count per booklet and a choice the studio has not confirmed).

export interface ShopDocItem {
  format: ShopDocFormat;
  color: ShopPrintColor;
  sides: ShopPrintSides;
  /** Pages of the file (an image counts as one). */
  pages: number;
  copies: number;
}

// ─── Photos (PDF page 9) ─────────────────────────────────────────────────────

export interface ShopPhotoSize {
  id: string;
  /** Paper size, cm (the stored `paperType` is `other:<w>x<h>`). */
  widthCm: number;
  heightCm: number;
  /** Printed image area for the resolution check (polaroid: the square window). */
  imageCm?: { widthCm: number; heightCm: number };
  /** Lei per photo (price list), as run-size tiers like documents. */
  tiers: GarmentPriceTier[];
  /** A-format alias shown with the size («A4»). */
  alias?: string;
}

const one = (priceMdl: number): GarmentPriceTier[] => [{ minQty: 1, priceMdl }];

/**
 * PDF 9, photo prints, lei per photo. No quantity discounts in the list
 * (GUESS: none). Glossy and matte cost the same (GUESS: the list names no finish).
 */
export const SHOP_PHOTO_SIZES: readonly ShopPhotoSize[] = [
  // Size not in the list — GUESS: classic 8.8×10.7 cm card with a 7.9×7.9 cm image window.
  { id: "polaroid", widthCm: 8.8, heightCm: 10.7, imageCm: { widthCm: 7.9, heightCm: 7.9 }, tiers: one(8) },
  { id: "9x13", widthCm: 9, heightCm: 13, tiers: one(6) },
  { id: "10x15", widthCm: 10, heightCm: 15, tiers: one(6) },
  { id: "13x18", widthCm: 13, heightCm: 18, tiers: one(10) },
  { id: "15x21", widthCm: 15, heightCm: 21, tiers: one(15) },
  { id: "18x24", widthCm: 18, heightCm: 24, tiers: one(25) },
  // The list's «20×25 / 20×30 / 21×30» row; A4 photo = 21×30.
  { id: "21x30", widthCm: 21, heightCm: 30, tiers: one(30), alias: "A4" },
  { id: "25x30", widthCm: 25, heightCm: 30, tiers: one(35) },
  { id: "25x38", widthCm: 25, heightCm: 38, tiers: one(40) },
  { id: "30x40", widthCm: 30, heightCm: 40, tiers: one(70) },
  { id: "30x45", widthCm: 30, heightCm: 45, tiers: one(70) },
];

export const SHOP_PHOTO_DEFAULT_SIZE = "10x15";
export const SHOP_PHOTO_FINISHES = ["glossy", "matte"] as const;
export type ShopPhotoFinish = (typeof SHOP_PHOTO_FINISHES)[number];
/** GUESS: the list does not say which finish the studio prints by default (draft question 7). */
export const SHOP_PHOTO_DEFAULT_FINISH: ShopPhotoFinish = "glossy";

export interface ShopPhotoItem {
  size: string;
  finish: ShopPhotoFinish;
  copies: number;
}

export type ShopPrintQuote =
  | { kind: "print"; mode: "doc"; items: ShopDocItem[] }
  | { kind: "print"; mode: "photo"; items: ShopPhotoItem[] };

const PHOTO_BY_ID: ReadonlyMap<string, ShopPhotoSize> = new Map(SHOP_PHOTO_SIZES.map((s) => [s.id, s]));

export function shopPhotoSize(id: string): ShopPhotoSize | null {
  return PHOTO_BY_ID.get(id) ?? null;
}

/** «10×15», «21×30 (A4)», «8,8×10,7» (decimal comma). */
export function photoSizeText(size: ShopPhotoSize): string {
  const n = (v: number) => String(v).replace(".", ",");
  return `${n(size.widthCm)}×${n(size.heightCm)}${size.alias ? ` (${size.alias})` : ""}`;
}

// ─── Validation ──────────────────────────────────────────────────────────────

function intIn(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function isShopDocItem(v: unknown): v is ShopDocItem {
  return (
    isObj(v) &&
    (SHOP_DOC_FORMATS as readonly unknown[]).includes(v.format) &&
    (SHOP_PRINT_COLORS as readonly unknown[]).includes(v.color) &&
    (SHOP_PRINT_SIDES as readonly unknown[]).includes(v.sides) &&
    intIn(v.pages, 1, SHOP_PRINT_MAX_PAGES) &&
    intIn(v.copies, 1, SHOP_PRINT_MAX_COPIES)
  );
}

export function isShopPhotoItem(v: unknown): v is ShopPhotoItem {
  return (
    isObj(v) &&
    typeof v.size === "string" &&
    PHOTO_BY_ID.has(v.size) &&
    (SHOP_PHOTO_FINISHES as readonly unknown[]).includes(v.finish) &&
    intIn(v.copies, 1, SHOP_PRINT_MAX_COPIES)
  );
}

/** A well-formed print line (stored carts, the checkout's file count check). */
export function isShopPrintQuote(v: unknown): v is ShopPrintQuote {
  if (!isObj(v) || v.kind !== "print" || !Array.isArray(v.items)) return false;
  if (v.items.length < 1 || v.items.length > SHOP_PRINT_MAX_FILES) return false;
  if (v.mode === "doc") return v.items.every(isShopDocItem);
  if (v.mode === "photo") return v.items.every(isShopPhotoItem);
  return false;
}

// ─── Price ───────────────────────────────────────────────────────────────────

/** Printed sheets of one copy: duplex = full sheets at the duplex price + an odd last page one-sided. */
export function docSheets(item: Pick<ShopDocItem, "pages" | "sides">): { one: number; two: number } {
  if (item.sides === "one") return { one: item.pages, two: 0 };
  return { one: item.pages % 2, two: Math.floor(item.pages / 2) };
}

export interface ShopPrintPrice {
  /** Whole lei. */
  total: number;
  /** Per item (file), whole lei, same order as `items`; they add up to `total`. */
  itemTotals: number[];
  /** Printed pages (documents: pages × copies) or photos — the line's «pieces». */
  quantity: number;
}

/** Price rows (the list above; tests pass run-size tiers to check the «never cheaper» cap). */
export interface ShopPrintPriceTable {
  doc: typeof SHOP_DOC_PRICES;
  photo: Readonly<Record<string, GarmentPriceTier[]>>;
}

export const SHOP_PRINT_PRICE_TABLE: ShopPrintPriceTable = {
  doc: SHOP_DOC_PRICES,
  photo: Object.fromEntries(SHOP_PHOTO_SIZES.map((s) => [s.id, s.tiers])),
};

interface Pool {
  tiers: GarmentPriceTier[];
  qty: number;
}

/**
 * Price of a print line. Units of the same price row (format / colour /
 * sides, or photo size) are pooled for the run-size tier and the total is
 * capped so a bigger run is never cheaper; each item is priced at the pool's
 * unit price. Totals are whole lei (the list has whole-lei prices; any
 * fraction from a future tier is rounded half up per pool). Null for an
 * invalid line.
 */
export function shopPrintPrice(quote: ShopPrintQuote, table: ShopPrintPriceTable = SHOP_PRINT_PRICE_TABLE): ShopPrintPrice | null {
  if (!isShopPrintQuote(quote)) return null;
  // Units of each item per pool key.
  const pools = new Map<string, Pool>();
  const itemUnits: { key: string; qty: number }[][] = [];
  const add = (key: string, tiers: GarmentPriceTier[], qty: number, units: { key: string; qty: number }[]) => {
    if (qty <= 0) return;
    const p = pools.get(key);
    if (p) p.qty += qty;
    else pools.set(key, { tiers, qty });
    units.push({ key, qty });
  };
  let quantity = 0;
  if (quote.mode === "doc") {
    for (const it of quote.items) {
      const units: { key: string; qty: number }[] = [];
      const row = table.doc[it.format][it.color];
      const s = docSheets(it);
      add(`${it.format}|${it.color}|one`, row.one, s.one * it.copies, units);
      add(`${it.format}|${it.color}|two`, row.two, s.two * it.copies, units);
      itemUnits.push(units);
      quantity += it.pages * it.copies;
    }
  } else {
    for (const it of quote.items) {
      const units: { key: string; qty: number }[] = [];
      const tiers = table.photo[it.size];
      if (!tiers) return null;
      add(it.size, tiers, it.copies, units);
      itemUnits.push(units);
      quantity += it.copies;
    }
  }

  // Pool totals (tier unit at the pooled quantity, capped by every higher tier).
  const poolTotal = new Map<string, number>();
  const poolUnit = new Map<string, number>();
  for (const [key, p] of pools) {
    const tier = tierPriceForQuantity(p.tiers, p.qty);
    if (!tier) return null;
    poolUnit.set(key, tier.priceMdl);
    poolTotal.set(key, Math.round(cappedTierTotal(p.tiers, p.qty, tier.priceMdl)));
  }
  const itemTotals: number[] = itemUnits.map((units) =>
    Math.round(units.reduce((s, u) => s + u.qty * poolUnit.get(u.key)!, 0)),
  );
  const total: number = [...poolTotal.values()].reduce((s, v) => s + v, 0);
  // A capped pool makes the items add up to more than the total: the last item takes the difference.
  const diff: number = total - itemTotals.reduce((s, v) => s + v, 0);
  if (diff !== 0 && itemTotals.length) itemTotals[itemTotals.length - 1] = Math.max(0, itemTotals[itemTotals.length - 1]! + diff);
  return { total, itemTotals, quantity };
}

/** Lei per printed side / photo for the price hints (first tier). */
export function docUnitPrice(format: ShopDocFormat, color: ShopPrintColor, sides: ShopPrintSides): number {
  return SHOP_DOC_PRICES[format][color][sides][0]!.priceMdl;
}

// ─── Order files (what production reads) ─────────────────────────────────────

/** `File.paperType` of an item, as print.anvi.md stores it: «A4» / «A3», a photo «other:10x15». */
export function printItemPaperType(mode: ShopPrintMode, item: ShopDocItem | ShopPhotoItem): string {
  if (mode === "doc") return (item as ShopDocItem).format;
  const s = shopPhotoSize((item as ShopPhotoItem).size);
  return s ? `other:${s.widthCm}x${s.heightCm}` : "other";
}

// ─── Photo quality ───────────────────────────────────────────────────────────

/** Effective dpi of a photo printed at `sizeId` (image area, either orientation); null when unknown. */
export function photoDpi(px: { width: number; height: number } | null | undefined, sizeId: string): number | null {
  const s = shopPhotoSize(sizeId);
  if (!px || !s || px.width <= 0 || px.height <= 0) return null;
  return effectiveDpi(px, s.imageCm ?? { widthCm: s.widthCm, heightCm: s.heightCm });
}

/** Below 150 dpi at the chosen size: the page warns (the order is still allowed). */
export function photoLowRes(px: { width: number; height: number } | null | undefined, sizeId: string): boolean {
  const dpi = photoDpi(px, sizeId);
  return dpi != null && dpi < SHOP_LOW_DPI;
}
