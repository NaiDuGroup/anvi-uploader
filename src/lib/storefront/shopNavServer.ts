import "server-only";
import { loadShopLfCards } from "@/lib/shop/largeFormatPage";
import { tryLoadShopCatalog } from "./catalog";
import { SHOP_CATEGORIES } from "./catalogConfig";
import type { ShopLang } from "./i18n";
import { SHOP_LF_CATEGORY_SLUG } from "./largeFormat";
import { PS_CATEGORY_SLUG } from "./printShop/config";
import { printShopListing, withPrintShopStock } from "./printShop/listing";
import { buildShopNav, type ShopNav, type ShopNavKey, type ShopNavStat } from "./shopNav";

/**
 * The navigation with live counts: listed products per category (as the
 * category pages list them), the print-shop listing and the available
 * wide-format products. Both loaders are cached per request, so pages that
 * load them too pay nothing extra. Without the database the links stay,
 * without counts.
 */
export async function loadShopNav(lang: ShopLang): Promise<ShopNav> {
  const [catalog, lfCount] = await Promise.all([
    tryLoadShopCatalog(lang),
    loadShopLfCards(lang)
      .then((cards) => cards.filter((c) => c.available).length)
      .catch((error: unknown) => {
        console.error("[shop] nav large format count failed:", error);
        return null;
      }),
  ]);
  const stats: Partial<Record<ShopNavKey, ShopNavStat>> = {};
  if (catalog) {
    // `catalog.categories` leaves out empty ones: a known 0 hides them.
    for (const c of SHOP_CATEGORIES) stats[c.slug] = { count: 0 };
    for (const c of catalog.categories) stats[c.slug] = { count: c.productCount, image: c.image };
  }
  stats[PS_CATEGORY_SLUG] = { count: withPrintShopStock(printShopListing(lang), catalog?.products ?? []).length };
  stats[SHOP_LF_CATEGORY_SLUG] = { count: lfCount };
  return buildShopNav(lang, stats);
}
