import { SHOP_BC_IMAGE, SHOP_BC_SLUG, shopBcPerCardMdl, shopBcTotalMdl, SHOP_BC_DEFAULT_PACK } from "./businessCards";
import { shopT, type ShopLang } from "./i18n";
import type { ShopProduct } from "./types";

/**
 * Business cards as a listing card (home page): not a catalog item, so this
 * builds the few fields `ProductCard` shows — name, subtitle, «from 1,50 lei / pc».
 */
export function shopBusinessCardProduct(lang: ShopLang): ShopProduct {
  const t = shopT(lang);
  return {
    slug: SHOP_BC_SLUG,
    // Not read by `ProductCard`; business cards have no catalog category.
    category: "caiete",
    name: t("bcTitle"),
    subtitle: t("bcSubtitle"),
    description: t("bcDescription"),
    badge: null,
    fromPrice: shopBcTotalMdl(SHOP_BC_DEFAULT_PACK, "one"),
    unitFrom: shopBcPerCardMdl("one"),
    image: SHOP_BC_IMAGE,
    available: true,
    mode: "simple",
    simpleKind: null,
    variants: [],
    dtf: null,
    editorHref: null,
    printAreaCm: null,
  };
}
