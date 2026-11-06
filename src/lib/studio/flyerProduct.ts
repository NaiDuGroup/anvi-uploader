import type { ShopLang } from "@/lib/storefront/i18n";
import { psLinePrice } from "@/lib/storefront/printShop/pricing";
import type { ShopProduct } from "@/lib/storefront/types";
import { flyerDefaultOptions, flyerProduct, flyerQuoteLine } from "./flyer";

/**
 * Flyers in the Studio (`/studio/flyer`): not a catalog item, so this builds
 * the few `ShopProduct` fields the Studio reads — the print-shop flyer
 * product's name, slug (`flyere`, the cart line slug) and picture, and the
 * default pack's price (display only; the cart quotes the real line). Pure.
 */
export function flyerShopProduct(lang: ShopLang): ShopProduct {
  const p = flyerProduct();
  const price = psLinePrice(flyerQuoteLine({ surfaces: [] }, flyerDefaultOptions()));
  return {
    slug: p.slug,
    // Not read by the Studio; flyers have no catalog category.
    category: "caiete",
    name: p.name[lang],
    subtitle: p.subtitle[lang],
    description: p.description[lang],
    badge: null,
    fromPrice: price?.total ?? null,
    unitFrom: price?.unitPrice ?? null,
    image: p.image,
    available: true,
    mode: "simple",
    simpleKind: null,
    variants: [],
    dtf: null,
    editorHref: null,
    printAreaCm: null,
  };
}
