import "server-only";
import { cookies } from "next/headers";
import { SHOP_LANG_COOKIE, parseShopLang, type ShopLang } from "./i18n";

/** Storefront language from the `shop_lang` cookie (Romanian by default). */
export async function getShopLang(): Promise<ShopLang> {
  const store = await cookies();
  return parseShopLang(store.get(SHOP_LANG_COOKIE)?.value);
}
