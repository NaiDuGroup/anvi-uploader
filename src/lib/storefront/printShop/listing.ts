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

/** Every product of the category, business cards first. */
export function printShopListing(lang: ShopLang): ShopProduct[] {
  return [shopBusinessCardProduct(lang), ...PS_PRODUCTS.map((p) => psListingProduct(p, lang)), uvStickersListingProduct(lang)];
}

/** A `/p/<slug>` served by the print shop (product id, or «uv» for UV-DTF stickers), or null. */
export function printShopPageOf(slug: string): { kind: "product"; product: PsProduct } | { kind: "uv" } | null {
  if (slug === SHOP_UV_STICKERS_SLUG) return { kind: "uv" };
  const p = psProductBySlug(slug);
  return p ? { kind: "product", product: p } : null;
}

/** Slugs of the print-shop product pages (sitemap). */
export const PRINT_SHOP_SLUGS: readonly string[] = [...PS_PRODUCTS.map((p) => p.slug), SHOP_UV_STICKERS_SLUG];
