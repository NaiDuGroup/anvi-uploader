import type { Metadata } from "next";
import { shopT, type ShopLang } from "./i18n";
import { isShopLaunched, shopOrigin } from "./shopHost";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Storefront layout metadata: absolute URLs on https://anvi.md, a canonical
 * for the clean path (when the middleware passed it) and noindex for the
 * whole storefront during the closed test (`SHOP_LAUNCHED` ≠ "1").
 */
export function shopLayoutMetadata(cleanPath: string | null, env: Env = process.env, lang: ShopLang = "ro"): Metadata {
  const t = shopT(lang);
  return {
    metadataBase: new URL(shopOrigin(env)),
    title: { default: t("metaTitle"), template: "%s · ANVI" },
    description: t("metaDescription"),
    ...(cleanPath?.startsWith("/") ? { alternates: { canonical: cleanPath } } : {}),
    ...(isShopLaunched(env) ? {} : { robots: { index: false, follow: false } }),
  };
}
