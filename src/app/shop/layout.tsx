import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { ShopBottomNav } from "@/components/shop/ShopBottomNav";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { ShopLangProvider } from "@/components/shop/ShopLangProvider";
import { SHOP_CATEGORIES } from "@/lib/storefront/catalogConfig";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { pickLocalized, shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import "./shop.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "ANVI — produse personalizate", template: "%s · ANVI" },
  description: "Carnete, căni, tricouri și pixuri cu designul tău. Producție proprie în Chișinău, livrare în toată Moldova.",
};

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const lang = await getShopLang();
  const contacts = await loadShopContacts();
  const t = shopT(lang);
  const categories = SHOP_CATEGORIES.map((c) => ({ slug: c.slug, name: pickLocalized(c.name, lang) }));
  return (
    <div lang={lang} className={`shop-root ${manrope.variable} flex min-h-screen flex-col pb-20 md:pb-0`}>
      <a
        href="#shop-main"
        className="sr-only z-50 rounded-lg bg-(--ink) px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("skipToContent")}
      </a>
      <ShopLangProvider lang={lang}>
        <ShopHeader categories={categories} />
        <div id="shop-main" className="flex-1">
          {children}
        </div>
        <ShopFooter lang={lang} contacts={contacts} />
        <ShopBottomNav catalogHref="/shop#catalog" />
      </ShopLangProvider>
    </div>
  );
}
