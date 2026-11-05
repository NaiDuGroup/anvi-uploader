import { SHOP_BC_SLUG } from "./businessCards";
import { printLineTitle, printOptionsText } from "@/lib/shop/printLine";
import { SHOP_PRINT_SLUG } from "./printPrices";
import { describeShopLfLine } from "./largeFormatLabels";
import { psProduct } from "./printShop/config";
import { psLineOptions, psLineTitle, psT } from "./printShop/text";
import { SHOP_UV_STICKERS_SLUG } from "./printShop/uvStickers";
import { shopLangOfT, type ShopLang, type ShopT } from "./i18n";
import { compareSizes, shopNumText, shopSizeLabel } from "./sizes";
import { quoteVariantId, SHOP_MADE_TO_ORDER_DAYS } from "./stock";
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
  variants: Record<
    string,
    {
      slug: string;
      name: string;
      option: string | null;
      stock?: number | null;
      /** Balance 0: made to order, this many extra working days. */
      madeToOrderDays?: number;
    }
  >;
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
      /** Item with sizes (bodysuit): the sizes are part of the options. */
      sized?: boolean;
      /** Sizes with a balance of 0 and the extra working days (made to order). */
      madeToOrder?: { sizes: string[]; days: number };
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
      out.variants[v.id] = {
        slug: p.slug,
        name: p.name,
        option: p.variants.length > 1 ? v.label : null,
        stock: v.stock,
        ...(v.madeToOrder ? { madeToOrderDays: p.madeToOrderDays ?? SHOP_MADE_TO_ORDER_DAYS } : {}),
      };
    }
    if (p.dtf) {
      const sized: boolean = p.dtf.garment === "item" && p.dtf.colors.some((c) => c.sizes.length > 1);
      for (const c of p.dtf.colors) {
        out.garments[c.garmentId] = {
          slug: p.slug,
          name: p.name,
          color: c.label,
          garment: p.dtf.garment,
          ...(p.dtf.itemZones.length ? { zones: Object.fromEntries(p.dtf.itemZones.map((z) => [z.side, z.label])) } : {}),
          fixedZone: p.dtf.fixedZone,
          sizeStock: c.sizeStock,
          ...(sized ? { sized: true } : {}),
          ...(c.madeToOrderSizes?.length
            ? { madeToOrder: { sizes: c.madeToOrderSizes, days: p.madeToOrderDays ?? SHOP_MADE_TO_ORDER_DAYS } }
            : {}),
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

/** «M×2, L×1»; age sizes in the language: «6 luni×1, 9 luni×2» (smallest first). */
export function sizesText(sizes: readonly { size: string; quantity: number }[], lang: ShopLang = "ro"): string {
  return sizes
    .filter((s) => s.quantity > 0)
    .slice()
    .sort((a, b) => compareSizes(a.size, b.size))
    .map((s) => `${shopSizeLabel(s.size, lang)}×${s.quantity}`)
    .join(", ");
}

/** Title + options of a quote line in the language of `labels` / `t`; null when the catalog does not know it. */
export function describeQuoteLine(quote: ShopQuoteLine, labels: ShopLineLabels, t: ShopT): LineText | null {
  // Business cards are not a catalog item: the name comes from the dictionary.
  if (quote.kind === "businessCard") {
    const sides: string = quote.sides === "two" ? t("bcSidesTwo") : t("bcSidesOne");
    // The fit is set only when a face has other proportions than 94×54.
    const fit: string | null = quote.fit === "contain" ? t("bcFitContain") : quote.fit === "cover" ? t("bcFitCover") : null;
    const lam: string | null = quote.lamination ? t(quote.lamination === "matte" ? "bcLaminationMatte" : "bcLaminationGloss") : null;
    const corners: string | null = quote.corners ? t("bcCorners") : null;
    return { slug: SHOP_BC_SLUG, title: t("bcTitle"), optionsText: [sides, lam, corners, fit].filter(Boolean).join(" · ") };
  }
  // Print shop («Tipografie») and UV-DTF stickers: names from the print-shop dictionary.
  if (quote.kind === "sheetShop") {
    const lang = shopLangOfT(t);
    return { slug: psProduct(quote.product)?.slug ?? quote.product, title: psLineTitle(quote, lang), optionsText: psLineOptions(quote, lang) };
  }
  if (quote.kind === "uv" && quote.source === "stickers") {
    const pt = psT(shopLangOfT(t));
    const lang = shopLangOfT(t);
    const sizes: string = quote.zones.map((z) => `${shopNumText(z.widthCm, lang)}×${shopNumText(z.heightCm, lang)}`).join("; ");
    return { slug: SHOP_UV_STICKERS_SLUG, title: pt("uvTitle"), optionsText: `${sizes} ${lang === "ru" ? "см" : "cm"}` };
  }
  // Photo / document printing: not a catalog item either.
  if (quote.kind === "print") {
    return { slug: SHOP_PRINT_SLUG, title: printLineTitle(quote, t), optionsText: printOptionsText(quote, t) };
  }
  // Wide format: not a catalog item either.
  if (quote.kind === "largeFormat") return describeShopLfLine(quote, t);
  if (quote.kind !== "dtf") {
    const v = labels.variants[quoteVariantId(quote) ?? ""];
    if (!v) return null;
    return { slug: v.slug, title: v.name, optionsText: v.option ?? "" };
  }
  const g = labels.garments[quote.garmentId];
  if (!g) return null;
  const parts: string[] = [g.color];
  if (g.garment === "tshirt") {
    parts.push(sizesText(quote.sizes, shopLangOfT(t)));
    for (const z of quote.zones) {
      const label: string | undefined = z.presetId ? labels.prints[z.presetId] : undefined;
      if (!label) return null;
      parts.push(`${z.id === "back" || z.placement === "back" ? t("zoneBack") : t("zoneFront")}: ${label}`);
    }
  } else if (g.garment === "item") {
    if (g.sized) parts.push(sizesText(quote.sizes, shopLangOfT(t)));
    for (const z of quote.zones) {
      const label: string | undefined = z.presetId ? labels.prints[z.presetId] : undefined;
      const zone: string | undefined = g.zones?.[z.id];
      if (!label || !zone) return null;
      parts.push(`${zone}: ${label}`);
    }
  } else if (g.fixedZone) {
    const lang = shopLangOfT(t);
    parts.push(t("capLogoSize", { size: `${shopNumText(g.fixedZone.widthCm, lang)}×${shopNumText(g.fixedZone.heightCm, lang)}` }));
  }
  return { slug: g.slug, title: g.name, optionsText: parts.filter(Boolean).join(" · ") };
}

/**
 * Extra working days when a cart line takes an option (or a size) with a
 * balance of 0 — «La comandă · +N zile»; null otherwise or when unknown.
 */
export function lineMadeToOrderDays(quote: ShopQuoteLine, labels: ShopLineLabels | null | undefined): number | null {
  if (!labels || quote.kind === "print" || quote.kind === "businessCard") return null;
  if (quote.kind !== "dtf") return labels.variants[quoteVariantId(quote) ?? ""]?.madeToOrderDays ?? null;
  const m = labels.garments[quote.garmentId]?.madeToOrder;
  return m && quote.sizes.some((s) => s.quantity > 0 && m.sizes.includes(s.size)) ? m.days : null;
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
  if (quote.kind === "print" || quote.kind === "largeFormat") return null;
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

/**
 * A size token of the options («L×2» in «Negru · L×2 · Față: A4 21×30», «6 luni×1»,
 * «6 мес.×1»), not a print size.
 */
const SIZE_QTY_TOKEN = /(?:^|[·,]\s*)(?:\d+(?:[.,]\d+)?(?:–\d+(?:[.,]\d+)?)? (?:de )?[^\s·,:×]+|[^\s·,:]+)×\d+(?=\s*(?:[·,]|$))/;

/**
 * « × 2» after a line's name and options, or "" when the options already
 * show the pieces per size (T-shirts: «L×2»), so the quantity is not repeated.
 */
export function qtySuffix(optionsText: string, quantity: number): string {
  return SIZE_QTY_TOKEN.test(optionsText) ? "" : ` × ${quantity}`;
}
