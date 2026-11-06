import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { ShopAnalytics } from "@/components/shop/ShopAnalytics";
import { ShopBottomNav } from "@/components/shop/ShopBottomNav";
import { CartFullToast } from "@/components/shop/CartFullToast";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { ShopNavProvider } from "@/components/shop/ShopCatalogNav";
import { ShopLangProvider } from "@/components/shop/ShopLangProvider";
import { LangSuggestBanner } from "@/components/shop/ShopLangSwitch";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { shopT } from "@/lib/storefront/i18n";
import { loadShopNav } from "@/lib/storefront/shopNavServer";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { SHOP_PATH_HEADER, isShopLaunched } from "@/lib/storefront/shopHost";
import { shopLayoutMetadata, shopTestBannerKeys } from "@/lib/storefront/shopMetadata";
import { shopPaymentState } from "@/lib/shop/paymentMode";
import { hasShopTesterAccess } from "@/lib/shop/testerAccess";
import { getShopCustomer } from "@/lib/shop/account/session";
import "./shop.css";

// Variable Manrope 400–800, latin + latin-ext + cyrillic (src/fonts/manrope).
const manrope = localFont({
  src: "../../fonts/manrope/Manrope-wght.woff2",
  weight: "400 800",
  variable: "--font-manrope",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  // Clean storefront path set by the middleware on the shop domain (anvi.md/cani).
  return shopLayoutMetadata((await headers()).get(SHOP_PATH_HEADER), process.env, await getShopLang());
}

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const lang = await getShopLang();
  const contacts = await loadShopContacts();
  const t = shopT(lang);
  const base = await getShopBase();
  const launched = isShopLaunched();
  const paymentState = shopPaymentState(process.env, { tester: await hasShopTesterAccess() });
  const bannerKeys = shopTestBannerKeys(launched, paymentState);
  const signedIn = (await getShopCustomer()) != null;
  const nav = await loadShopNav(lang);
  return (
    <div lang={lang} className={`shop-root ${manrope.variable} flex min-h-screen flex-col pb-20 md:pb-0`}>
      <a
        href="#shop-main"
        className="sr-only z-50 rounded-lg bg-(--ink) px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("skipToContent")}
      </a>
      <ShopLangProvider lang={lang} base={base} paymentLive={paymentState === "real"} signedIn={signedIn}>
        <LangSuggestBanner />
        {bannerKeys.length ? (
          <p
            role="note"
            className="m-0 bg-(--warn-soft) px-4 py-1.5 text-center text-[13px] font-bold leading-snug text-(--warn)"
          >
            {bannerKeys.map((k) => t(k)).join(" · ")}
          </p>
        ) : null}
        <ShopNavProvider nav={nav}>
          <ShopHeader />
          <div id="shop-main" className="flex-1">
            {children}
          </div>
          <ShopFooter lang={lang} contacts={contacts} base={base} />
          <ShopBottomNav />
        </ShopNavProvider>
        <CartFullToast />
        <ShopAnalytics />
      </ShopLangProvider>
    </div>
  );
}
