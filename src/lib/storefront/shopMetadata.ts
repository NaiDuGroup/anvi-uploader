import type { Metadata } from "next";
import { SHOP_LANGS, shopT, type ShopLang } from "./i18n";
import { isShopLaunched, shopOrigin } from "./shopHost";
import { SHOP_DEFAULT_OG_IMAGE, SHOP_OG_LOCALE, SHOP_SITE_NAME } from "./shopSeo";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Storefront layout metadata: absolute URLs on https://anvi.md, a canonical
 * for the clean path and default link-preview tags. `cleanPath` is set by the
 * middleware on shop hosts only, so it also tells where the page renders:
 * - shop host, launched (`SHOP_LAUNCHED=1`) → index, follow;
 * - shop host during the closed test → noindex;
 * - any other host (print.anvi.md/shop/…, previews) → noindex, always:
 *   the indexed copy is the anvi.md one.
 */
export function shopLayoutMetadata(cleanPath: string | null, env: Env = process.env, lang: ShopLang = "ro"): Metadata {
  const t = shopT(lang);
  const onShopHost: boolean = cleanPath?.startsWith("/") ?? false;
  const indexable: boolean = onShopHost && isShopLaunched(env);
  return {
    metadataBase: new URL(shopOrigin(env)),
    title: { default: t("metaTitle"), template: "%s · ANVI" },
    description: t("metaDescription"),
    ...(onShopHost ? { alternates: { canonical: cleanPath! } } : {}),
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: SHOP_SITE_NAME,
      title: t("metaTitle"),
      description: t("metaDescription"),
      ...(onShopHost ? { url: cleanPath! } : {}),
      locale: SHOP_OG_LOCALE[lang],
      alternateLocale: SHOP_LANGS.filter((l) => l !== lang).map((l) => SHOP_OG_LOCALE[l]),
      images: [SHOP_DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: t("metaTitle"),
      description: t("metaDescription"),
      images: [SHOP_DEFAULT_OG_IMAGE.url],
    },
  };
}

/**
 * The strip above the storefront header: «closed test» until launched, plus
 * «tester mode» while only a tester pass / staff session can pay. Launching
 * alone does not make payment real: that is `shopPaymentState` (Paynet).
 */
export function shopTestBannerKeys(
  launched: boolean,
  paymentState: "real" | "test" | "tester" | "unavailable",
): ("closedTestBanner" | "testerMode")[] {
  const tester: boolean = paymentState === "tester";
  if (!launched) return tester ? ["closedTestBanner", "testerMode"] : ["closedTestBanner"];
  return tester ? ["testerMode"] : [];
}
