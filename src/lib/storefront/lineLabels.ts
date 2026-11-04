import type { ShopT } from "./i18n";
import { quoteVariantId } from "./stock";
import type { ShopDtfGarment, ShopProduct, ShopQuoteLine } from "./types";

/**
 * Names of cart / order lines in the visitor's CURRENT language. A cart line
 * keeps only language-neutral keys (variant / garment / preset ids, sizes,
 * zones); its title and options are rebuilt from the catalog every time they
 * are shown, so switching RO ↔ RU renames the cart too. Lines the catalog no
 * longer knows fall back to the text stored when they were added.
 *
 * Pure (client-safe, unit-tested).
 */

export interface ShopLineLabels {
  /** Stock variant id (mug / notebook / pen quote `productId`, UV item `variantId`) → product. */
  variants: Record<string, { slug: string; name: string; option: string | null; stock?: number | null }>;
  /** DTF `garmentId` → product and colour. */
  garments: Record<
    string,
    {
      slug: string;
      name: string;
      color: string;
      garment: ShopDtfGarment;
      /** Item (bag, toy): zone id («front» / «back») → its label. */
      zones?: Record<string, string>;
      fixedZone: { widthCm: number; heightCm: number } | null;
      /** Pieces in stock per size (a size missing = not tracked). */
      sizeStock?: Record<string, number>;
    }
  >;
  /** DTF price-list preset id → its label («A4 (21×29,7 cm)»). */
  prints: Record<string, string>;
}

export const EMPTY_LINE_LABELS: ShopLineLabels = { variants: {}, garments: {}, prints: {} };

/** Label lookup for a set of products (already in one language). */
export function buildLineLabels(products: readonly ShopProduct[]): ShopLineLabels {
  const out: ShopLineLabels = { variants: {}, garments: {}, prints: {} };
  for (const p of products) {
    for (const v of p.variants) {
      out.variants[v.id] = { slug: p.slug, name: p.name, option: p.variants.length > 1 ? v.label : null, stock: v.stock };
    }
    if (p.dtf) {
      for (const c of p.dtf.colors) {
        out.garments[c.garmentId] = {
          slug: p.slug,
          name: p.name,
          color: c.label,
          garment: p.dtf.garment,
          ...(p.dtf.itemZones.length ? { zones: Object.fromEntries(p.dtf.itemZones.map((z) => [z.side, z.label])) } : {}),
          fixedZone: p.dtf.fixedZone,
          sizeStock: c.sizeStock,
        };
      }
      for (const pr of p.dtf.prints) out.prints[pr.presetId] = pr.label;
    }
  }
  return out;
}

export interface LineText {
  slug: string;
  title: string;
  optionsText: string;
}

/** «M×2, L×1». */
export function sizesText(sizes: readonly { size: string; quantity: number }[]): string {
  return sizes
    .filter((s) => s.quantity > 0)
    .map((s) => `${s.size}×${s.quantity}`)
    .join(", ");
}

/** Title + options of a quote line in the language of `labels` / `t`; null when the catalog does not know it. */
export function describeQuoteLine(quote: ShopQuoteLine, labels: ShopLineLabels, t: ShopT): LineText | null {
  if (quote.kind !== "dtf") {
    const v = labels.variants[quoteVariantId(quote) ?? ""];
    if (!v) return null;
    return { slug: v.slug, title: v.name, optionsText: v.option ?? "" };
  }
  const g = labels.garments[quote.garmentId];
  if (!g) return null;
  const parts: string[] = [g.color];
  if (g.garment === "tshirt") {
    parts.push(sizesText(quote.sizes));
    for (const z of quote.zones) {
      const label: string | undefined = z.presetId ? labels.prints[z.presetId] : undefined;
      if (!label) return null;
      parts.push(`${z.id === "back" || z.placement === "back" ? t("zoneBack") : t("zoneFront")}: ${label}`);
    }
  } else if (g.garment === "item") {
    for (const z of quote.zones) {
      const label: string | undefined = z.presetId ? labels.prints[z.presetId] : undefined;
      const zone: string | undefined = g.zones?.[z.id];
      if (!label || !zone) return null;
      parts.push(`${zone}: ${label}`);
    }
  } else if (g.fixedZone) {
    parts.push(`logo ${g.fixedZone.widthCm}×${g.fixedZone.heightCm} cm`);
  }
  return { slug: g.slug, title: g.name, optionsText: parts.filter(Boolean).join(" · ") };
}

/**
 * Most pieces a cart line can have from stock (a simple / UV line, or a
 * one-size DTF line); null when not tracked, unknown or several sizes.
 */
export function lineStockLimit(quote: ShopQuoteLine, labels: ShopLineLabels | null | undefined): number | null {
  if (!labels) return null;
  if (quote.kind !== "dtf") return labels.variants[quoteVariantId(quote) ?? ""]?.stock ?? null;
  if (quote.sizes.length !== 1) return null;
  return labels.garments[quote.garmentId]?.sizeStock?.[quote.sizes[0]!.size] ?? null;
}

/**
 * Pieces asked beyond the stock in a cart line (any size of a DTF line): the
 * first size short, with what is left; null when everything is available.
 */
export function lineStockShortage(
  quote: ShopQuoteLine,
  labels: ShopLineLabels | null | undefined,
): { available: number; size?: string } | null {
  if (!labels) return null;
  if (quote.kind !== "dtf") {
    const stock = labels.variants[quoteVariantId(quote) ?? ""]?.stock;
    return stock != null && quote.quantity > stock ? { available: stock } : null;
  }
  const sizeStock = labels.garments[quote.garmentId]?.sizeStock;
  for (const s of quote.sizes) {
    const left: number | undefined = sizeStock?.[s.size];
    if (left != null && s.quantity > left) return { available: left, size: s.size };
  }
  return null;
}

/** What a cart line shows: rebuilt from the catalog, else the text saved with the line. */
export function cartLineText(
  line: { slug: string; title: string; optionsText: string; quote: ShopQuoteLine },
  labels: ShopLineLabels | null | undefined,
  t: ShopT,
): LineText {
  const live = labels ? describeQuoteLine(line.quote, labels, t) : null;
  return live ?? { slug: line.slug, title: line.title, optionsText: line.optionsText };
}

/** A size token of the options («L×2» in «Negru · L×2 · Față: A4 21×30»), not a print size. */
const SIZE_QTY_TOKEN = /(?:^|[·,]\s*)[^\s·,:]+×\d+(?=\s*(?:[·,]|$))/;

/**
 * « × 2» after a line's name and options, or "" when the options already
 * show the pieces per size (T-shirts: «L×2»), so the quantity is not repeated.
 */
export function qtySuffix(optionsText: string, quantity: number): string {
  return SIZE_QTY_TOKEN.test(optionsText) ? "" : ` × ${quantity}`;
}
