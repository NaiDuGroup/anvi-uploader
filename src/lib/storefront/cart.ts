import { isShopBcFit, isShopBcPack, isShopBcSides } from "./businessCards";
import { isShopPrintQuote } from "./printPrices";
import { isShopLfQuote } from "./largeFormat";
import { checkoutDesign, parseLineDesign, type ShopLineDesign } from "./design";
import type { LineText } from "./lineLabels";
import { isShopUvLine } from "./stock";
import type { ShopFileRef, ShopQuoteLine } from "./types";

/**
 * Storefront cart: a list of configured lines kept in `localStorage`. Pure —
 * the browser store (`cartStore.ts`) wraps it. Prices are never trusted from
 * here: the cart page re-quotes every line and the checkout prices on the server.
 */

export const CART_STORAGE_KEY = "anvi_shop_cart_v1";
export const CART_MAX_LINES = 50;
/** Pieces per line: the server's limit too (`PUBLIC_QUOTE_MAX_ITEM_QTY`, `DTF_MAX_PIECES`, `UV_MAX_PIECES`). */
export const CART_MAX_QTY = 5000;

export interface CartLine {
  id: string;
  slug: string;
  /**
   * Name and options as they were when the line was added — a fallback only:
   * pages rebuild them in the current language from `quote` (see `lineLabels.ts`).
   */
  title: string;
  optionsText: string;
  image: string | null;
  quote: ShopQuoteLine;
  files: ShopFileRef[];
  note?: string;
  /** Last known total (display hint only, refreshed by a quote). */
  lastTotal?: number | null;
  addedAt: number;
  /**
   * «Repetă comanda»: names of the order's files that were deleted since —
   * the cart asks to upload them again. Gone once the line is saved on its
   * product page.
   */
  missingFiles?: string[];
  /**
   * Made in the shop-mode editor: its layout (to open it again) and a
   * thumbnail. The line's file is the editor's print PNG.
   */
  design?: ShopLineDesign;
}

export type CartAction =
  | { type: "add"; line: CartLine }
  /** Replace a line edited on its product page (keeps its place in the cart). */
  | { type: "update"; line: CartLine }
  | { type: "remove"; id: string }
  /** Drop the lines that went into a placed order (lines added since stay). */
  | { type: "removeIds"; ids: readonly string[] }
  | { type: "setQty"; id: string; quantity: number }
  | { type: "setTotals"; totals: Record<string, number | null> }
  | { type: "clear" }
  | { type: "replace"; lines: CartLine[] };

export function clampQty(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.min(CART_MAX_QTY, Math.max(1, Math.round(q)));
}

/** Pieces in a line (DTF: all sizes together). */
export function lineQuantity(quote: ShopQuoteLine): number {
  // Photo / document printing: the files (each with its own copies).
  if (quote.kind === "print") return quote.items.length;
  if (quote.kind === "dtf") return quote.sizes.reduce((s, x) => s + x.quantity, 0);
  return quote.quantity;
}

/** Whether the cart can change the quantity with one stepper (not a multi-size DTF line, not a business-card pack). */
export function canStepQuantity(quote: ShopQuoteLine): boolean {
  if (quote.kind === "businessCard" || quote.kind === "print") return false;
  return quote.kind !== "dtf" || quote.sizes.length === 1;
}

export function withQuantity(quote: ShopQuoteLine, quantity: number): ShopQuoteLine {
  const q: number = clampQty(quantity);
  if (quote.kind === "dtf") {
    if (quote.sizes.length !== 1) return quote;
    return { ...quote, sizes: [{ ...quote.sizes[0]!, quantity: q }] };
  }
  // Print lines: copies are per file, set on the print page.
  if (quote.kind === "print") return quote;
  return { ...quote, quantity: q };
}

export function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add":
      if (state.length >= CART_MAX_LINES) return state;
      return [...state, action.line];
    case "update":
      return state.some((l) => l.id === action.line.id)
        ? state.map((l) => (l.id === action.line.id ? action.line : l))
        : state.length >= CART_MAX_LINES
          ? state
          : [...state, action.line];
    case "remove":
      return state.filter((l) => l.id !== action.id);
    case "removeIds": {
      const ids = new Set(action.ids);
      return state.filter((l) => !ids.has(l.id));
    }
    case "setQty":
      return state.map((l) =>
        l.id === action.id && canStepQuantity(l.quote)
          ? { ...l, quote: withQuantity(l.quote, action.quantity), lastTotal: null }
          : l,
      );
    case "setTotals":
      return state.map((l) => (l.id in action.totals ? { ...l, lastTotal: action.totals[l.id] } : l));
    case "clear":
      return [];
    case "replace":
      return action.lines;
  }
}

/**
 * The cart badge / «N produse»: the number of lines (a pack of 200 business
 * cards or 50 mugs is one product), as most shops count.
 */
export function cartCount(lines: readonly CartLine[]): number {
  return lines.length;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function isQuoteLine(v: unknown): v is ShopQuoteLine {
  if (!isObj(v)) return false;
  if (v.kind === "mug" || v.kind === "notebook" || v.kind === "pen") {
    return typeof v.productId === "string" && typeof v.quantity === "number" && v.quantity >= 1;
  }
  if (v.kind === "uv") return isShopUvLine(v);
  if (v.kind === "print") return isShopPrintQuote(v);
  if (v.kind === "largeFormat") return isShopLfQuote(v);
  if (v.kind === "businessCard") {
    return v.pricing === "shopPack" && isShopBcSides(v.sides) && isShopBcPack(v.quantity) && (v.fit == null || isShopBcFit(v.fit));
  }
  if (v.kind === "dtf") {
    return (
      typeof v.garmentId === "string" &&
      Array.isArray(v.sizes) &&
      v.sizes.length > 0 &&
      v.sizes.every((s) => isObj(s) && typeof s.size === "string" && typeof s.quantity === "number" && s.quantity >= 1) &&
      Array.isArray(v.zones) &&
      v.zones.length > 0
    );
  }
  return false;
}

function isFileRef(v: unknown): v is ShopFileRef {
  return isObj(v) && typeof v.fileKey === "string" && typeof v.fileName === "string";
}

/** A stored file ref; a thumbnail that is not a small image data URL is dropped. */
function cleanFileRef(f: ShopFileRef): ShopFileRef {
  if (f.thumb == null || isShopThumbUrl(f.thumb)) return f;
  const rest = { ...f };
  delete rest.thumb;
  return rest;
}

/** Client-made thumbnail: an image data URL under 200 kB. */
export function isShopThumbUrl(v: unknown): v is string {
  return typeof v === "string" && /^data:image\/(?:jpeg|png|webp|svg\+xml)[;,]/.test(v) && v.length <= 200_000;
}

/** Parse what `localStorage` holds; malformed lines are dropped, never thrown. */
export function parseCart(raw: string | null | undefined): CartLine[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list: unknown = isObj(data) ? data.lines : data;
  if (!Array.isArray(list)) return [];
  const out: CartLine[] = [];
  for (const l of list) {
    if (!isObj(l) || typeof l.id !== "string" || typeof l.slug !== "string" || typeof l.title !== "string") continue;
    if (!isQuoteLine(l.quote)) continue;
    const design: ShopLineDesign | null = l.design == null ? null : parseLineDesign(l.design, l.quote);
    out.push({
      id: l.id,
      slug: l.slug,
      title: l.title,
      optionsText: typeof l.optionsText === "string" ? l.optionsText : "",
      image: typeof l.image === "string" ? l.image : null,
      quote: l.quote,
      files: Array.isArray(l.files) ? l.files.filter(isFileRef).map(cleanFileRef) : [],
      ...(typeof l.note === "string" && l.note ? { note: l.note } : {}),
      lastTotal: typeof l.lastTotal === "number" ? l.lastTotal : null,
      addedAt: typeof l.addedAt === "number" ? l.addedAt : 0,
      ...(Array.isArray(l.missingFiles) && l.missingFiles.some((n) => typeof n === "string")
        ? { missingFiles: l.missingFiles.filter((n): n is string => typeof n === "string").slice(0, 20) }
        : {}),
      ...(design ? { design } : {}),
    });
    if (out.length >= CART_MAX_LINES) break;
  }
  return out;
}

export function serializeCart(lines: readonly CartLine[]): string {
  return JSON.stringify({ v: 1, lines });
}

export function newLineId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Body line for `POST /api/shop/checkout` (files without the client-only
 * hints; a DTF / business-card file keeps its zone so the workshop knows
 * front from back).
 * `text` is the line's name in the checkout language (else the stored one).
 */
export function checkoutLine(line: CartLine, text?: Pick<LineText, "title" | "optionsText">) {
  const title: string = text?.title || line.title;
  const optionsText: string = text ? text.optionsText : line.optionsText;
  return {
    quote: line.quote,
    ...(line.files.length
      ? {
          files: line.files.map((f) => ({
            fileKey: f.fileKey,
            fileName: f.fileName,
            ...(f.sizeBytes != null ? { sizeBytes: f.sizeBytes } : {}),
            ...((line.quote.kind === "dtf" || line.quote.kind === "businessCard") && f.zone ? { zone: f.zone } : {}),
          })),
        }
      : {}),
    ...(line.note ? { note: line.note } : {}),
    ...(line.design && line.files.length ? { design: checkoutDesign(line.design) } : {}),
    title,
    ...(optionsText ? { optionsText } : {}),
  };
}
