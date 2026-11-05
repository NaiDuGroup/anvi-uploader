import "server-only";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { buildLineLabels, EMPTY_LINE_LABELS } from "@/lib/storefront/lineLabels";
import type { ShopLang } from "@/lib/storefront/i18n";
import type { ShopCategorySlug } from "@/lib/storefront/types";
import { shopLineProductRef, shopProductNames, type ShopLineProductRef } from "./lineProduct";

export type ShopLineRefResolver = (quote: unknown) => ShopLineProductRef | null;

/**
 * Line → product / category resolver over the live catalog (Russian names).
 * Without a catalog (database down) only the non-catalog lines resolve.
 */
export async function loadShopLineRefResolver(): Promise<ShopLineRefResolver> {
  const catalog = await tryLoadShopCatalog("ru");
  const labels = catalog ? buildLineLabels(catalog.products) : EMPTY_LINE_LABELS;
  const productCategory: Record<string, ShopCategorySlug> = {};
  for (const p of catalog?.products ?? []) productCategory[p.slug] = p.category;
  return (quote) => shopLineProductRef(quote, labels, productCategory);
}

/** Product names by slug in `lang` (report tables): catalog products + print-shop / wide-format pages. */
export async function loadShopProductNames(lang: ShopLang): Promise<Record<string, string>> {
  const catalog = await tryLoadShopCatalog(lang);
  return shopProductNames(lang, catalog?.products ?? []);
}

/** Russian product names by slug (staff UI). */
export async function loadShopProductNamesRu(): Promise<Record<string, string>> {
  return loadShopProductNames("ru");
}
