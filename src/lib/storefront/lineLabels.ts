import type { ShopT } from "./i18n";
import type { ShopProduct, ShopQuoteLine } from "./types";

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
  /** Stock variant id (mug / notebook / pen quote `productId`) → product. */
  variants: Record<string, { slug: string; name: string; option: string | null }>;
  /** DTF `garmentId` → product and colour. */
  garments: Record<
    string,
    { slug: string; name: string; color: string; garment: "tshirt" | "cap"; fixedZone: { widthCm: number; heightCm: number } | null }
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
      out.variants[v.id] = { slug: p.slug, name: p.name, option: p.variants.length > 1 ? v.label : null };
    }
    if (p.dtf) {
      for (const c of p.dtf.colors) {
        out.garments[c.garmentId] = {
          slug: p.slug,
          name: p.name,
          color: c.label,
          garment: p.dtf.garment,
          fixedZone: p.dtf.fixedZone,
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
    const v = labels.variants[quote.productId];
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
  } else if (g.fixedZone) {
    parts.push(`logo ${g.fixedZone.widthCm}×${g.fixedZone.heightCm} cm`);
  }
  return { slug: g.slug, title: g.name, optionsText: parts.filter(Boolean).join(" · ") };
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
