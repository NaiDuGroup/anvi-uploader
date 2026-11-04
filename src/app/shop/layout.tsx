import type { Metadata } from "next";
import { headers } from "next/headers";
import { Manrope } from "next/font/google";
import { ShopBottomNav } from "@/components/shop/ShopBottomNav";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { ShopLangProvider } from "@/components/shop/ShopLangProvider";
import { SHOP_CATEGORIES } from "@/lib/storefront/catalogConfig";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { pickLocalized, shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { SHOP_PATH_HEADER, isShopLaunched } from "@/lib/storefront/shopHost";
import { shopLayoutMetadata } from "@/lib/storefront/shopMetadata";
import { shopPaymentState } from "@/lib/shop/paymentMode";
import { hasShopTesterAccess } from "@/lib/shop/testerAccess";
import "./shop.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
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
  const testerOnly = paymentState === "tester";
  const categories = SHOP_CATEGORIES.map((c) => ({ slug: c.slug, name: pickLocalized(c.name, lang) }));
  return (
    <div lang={lang} className={`shop-root ${manrope.variable} flex min-h-screen flex-col pb-20 md:pb-0`}>
      <a
        href="#shop-main"
        className="sr-only z-50 rounded-lg bg-(--ink) px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("skipToContent")}
      </a>
      <ShopLangProvider lang={lang} base={base} paymentLive={paymentState === "real"}>
        {!launched || testerOnly ? (
          <p
            role="note"
            className="m-0 bg-(--warn-soft) px-4 py-1.5 text-center text-[13px] font-bold leading-snug text-(--warn)"
          >
            {launched ? t("testerMode") : t("closedTestBanner")}
            {!launched && testerOnly ? ` · ${t("testerMode")}` : null}
          </p>
        ) : null}
        <ShopHeader categories={categories} />
        <div id="shop-main" className="flex-1">
          {children}
        </div>
        <ShopFooter lang={lang} contacts={contacts} base={base} />
        <ShopBottomNav catalogHref="/shop#catalog" />
      </ShopLangProvider>
    </div>
  );
}
