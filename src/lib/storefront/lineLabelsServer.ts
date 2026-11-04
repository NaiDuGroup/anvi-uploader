import "server-only";
import { tryLoadShopCatalog } from "./catalog";
import type { ShopLang } from "./i18n";
import { buildLineLabels, type ShopLineLabels } from "./lineLabels";

/** Cart / order line names in `lang` from the live catalog; null when the catalog is unreachable. */
export async function loadShopLineLabels(lang: ShopLang): Promise<ShopLineLabels | null> {
  const catalog = await tryLoadShopCatalog(lang);
  return catalog ? buildLineLabels(catalog.products) : null;
}
