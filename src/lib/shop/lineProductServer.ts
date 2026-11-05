import "server-only";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { buildLineLabels, EMPTY_LINE_LABELS } from "@/lib/storefront/lineLabels";
import type { ShopCategorySlug } from "@/lib/storefront/types";
import { SHOP_BC_SLUG } from "@/lib/storefront/businessCards";
import { SHOP_PRINT_SLUG } from "@/lib/storefront/printPrices";
import { PS_PRODUCTS } from "@/lib/storefront/printShop/config";
import { SHOP_UV_STICKERS_SLUG } from "@/lib/storefront/printShop/uvStickers";
import { shopLineProductRef, type ShopLineProductRef } from "./lineProduct";

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

/** Russian product names by slug (report tables): catalog products + print-shop pages. */
export async function loadShopProductNamesRu(): Promise<Record<string, string>> {
  const catalog = await tryLoadShopCatalog("ru");
  const out: Record<string, string> = {
    [SHOP_BC_SLUG]: "Визитки",
    [SHOP_PRINT_SLUG]: "Печать фото и документов",
    [SHOP_UV_STICKERS_SLUG]: "UV-DTF наклейки",
  };
  for (const p of PS_PRODUCTS) out[p.slug] = p.staffRu;
  for (const p of catalog?.products ?? []) out[p.slug] = p.name;
  return out;
}
