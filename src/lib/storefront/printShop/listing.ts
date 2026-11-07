import { shopBusinessCardProduct } from "../businessCardProduct";
import type { ShopLang } from "../i18n";
import type { ShopProduct } from "../types";
import { PS_PRODUCTS, psProductBySlug, type PsProduct } from "./config";
import { psDefaultLine, psFromPerPiece, psLinePrice } from "./pricing";
import { psT } from "./text";
import { SHOP_UV_IMAGE, SHOP_UV_MINIMUM_MDL, SHOP_UV_STICKERS_SLUG } from "./uvStickers";

/**
 * «Tipografie» listing cards (category page, home page): not catalog items,
 * so these build the few fields `ProductCard` shows — name, subtitle, «from
 * N lei / pc» — like `shopBusinessCardProduct`.
 */

function card(o: { slug: string; name: string; subtitle: string; description: string; image: string; fromPrice: number | null; unitFrom: number | null }): ShopProduct {
  return {
    ...o,
    // Not read by `ProductCard`; print-shop products have no catalog category.
    category: "caiete",
    badge: null,
    available: true,
    mode: "simple",
    simpleKind: null,
    variants: [],
    dtf: null,
    editorHref: null,
    printAreaCm: null,
  };
}

export function psListingProduct(p: PsProduct, lang: ShopLang): ShopProduct {
  return card({
    slug: p.slug,
    name: p.name[lang],
    subtitle: p.subtitle[lang],
    description: p.description[lang],
    image: p.image,
    fromPrice: psLinePrice(psDefaultLine(p))?.total ?? null,
    unitFrom: psFromPerPiece(p),
  });
}

export function uvStickersListingProduct(lang: ShopLang): ShopProduct {
  const t = psT(lang);
  return card({
    slug: SHOP_UV_STICKERS_SLUG,
    name: t("uvTitle"),
    subtitle: t("uvSubtitle"),
    description: t("uvDescription"),
    image: SHOP_UV_IMAGE,
    fromPrice: SHOP_UV_MINIMUM_MDL,
    unitFrom: null,
  });
}

/**
 * Print-shop products the studio no longer makes (owner 2026-11-07): hidden from
 * the shop (listings, nav counts, sitemap, their /p page), still priced so old
 * orders and staff tools keep working. Remove a slug here to bring it back.
 */
export const PS_HIDDEN_SLUGS: ReadonlySet<string> = new Set(["calendare-de-buzunar", "calendare-casuta", "calendare-de-birou"]);

/** The print-shop products offered in the shop (without `PS_HIDDEN_SLUGS`). */
export const PS_SHOP_PRODUCTS: readonly PsProduct[] = PS_PRODUCTS.filter((p) => !PS_HIDDEN_SLUGS.has(p.slug));

/**
 * Every product of the category, business cards first. `withHidden`: also the
 * hidden ones (images of past orders).
 */
export function printShopListing(lang: ShopLang, opts: { withHidden?: boolean } = {}): ShopProduct[] {
  const products: readonly PsProduct[] = opts.withHidden ? PS_PRODUCTS : PS_SHOP_PRODUCTS;
  return [shopBusinessCardProduct(lang), ...products.map((p) => psListingProduct(p, lang)), uvStickersListingProduct(lang)];
}

/**
 * Stock catalog products shown in the «Tipografie» listing, each right after
 * the print-shop card it belongs with (stock slug → print-shop slug): the MEDUS
 * desk calendar closes the calendar group (it has no stock «Calendare» category).
 */
export const PS_STOCK_AFTER: Readonly<Record<string, string>> = { "calendar-medus": "calendare-poster" };

/** The listing with the available stock products of `PS_STOCK_AFTER` placed in their groups. */
export function withPrintShopStock(listing: readonly ShopProduct[], catalogProducts: readonly ShopProduct[]): ShopProduct[] {
  const out: ShopProduct[] = [...listing];
  for (const [stockSlug, afterSlug] of Object.entries(PS_STOCK_AFTER)) {
    const p = catalogProducts.find((x) => x.slug === stockSlug && x.available);
    if (!p) continue;
    const at: number = out.findIndex((x) => x.slug === afterSlug);
    out.splice(at < 0 ? out.length : at + 1, 0, p);
  }
  return out;
}

/** A `/p/<slug>` served by the print shop (product id, or «uv» for UV-DTF stickers), or null. */
export function printShopPageOf(slug: string): { kind: "product"; product: PsProduct } | { kind: "uv" } | null {
  if (slug === SHOP_UV_STICKERS_SLUG) return { kind: "uv" };
  const p = psProductBySlug(slug);
  return p && !PS_HIDDEN_SLUGS.has(p.slug) ? { kind: "product", product: p } : null;
}

/** Slugs of the print-shop product pages (sitemap). */
export const PRINT_SHOP_SLUGS: readonly string[] = [...PS_SHOP_PRODUCTS.map((p) => p.slug), SHOP_UV_STICKERS_SLUG];
