import type { Metadata } from "next";
import Link from "next/link";
import { CatalogError } from "@/components/shop/CatalogError";
import { JsonLd } from "@/components/shop/JsonLd";
import { LfOnRequest, type LfRequestContact } from "@/components/shop/LfOnRequest";
import { ShopImg } from "@/components/shop/ShopImg";
import { loadShopLfCards } from "@/lib/shop/largeFormatPage";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { formatPrice } from "@/lib/storefront/format";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { SHOP_LF_CATEGORY_PATH } from "@/lib/storefront/largeFormat";
import { lfText } from "@/lib/storefront/largeFormatText";
import { getShopBase } from "@/lib/storefront/shopBase";
import { shopHref } from "@/lib/storefront/shopHost";
import { breadcrumbJsonLd, shopPageMetadata } from "@/lib/storefront/shopSeo";
import type { ShopProduct } from "@/lib/storefront/types";
import { formatPhone, telHref, telegramHref, viberHref, whatsappHref } from "@/lib/studioInfo/studioInfo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getShopLang();
  const t = shopT(lang);
  return shopPageMetadata({ title: t("lfNav"), description: lfText(lang)("categoryIntro"), path: SHOP_LF_CATEGORY_PATH, lang });
}

/** «Print mare format»: the wide-format products and what is made on request. */
export default async function ShopLargeFormatPage() {
  const lang = await getShopLang();
  const t = shopT(lang);
  const lt = lfText(lang);
  const base = await getShopBase();
  const href = (p: string) => shopHref(base, p);
  let cards: (ShopProduct & { fixedPrice: boolean })[];
  try {
    cards = (await loadShopLfCards(lang)).filter((c) => c.available);
  } catch (error) {
    console.error("[shop] large format cards failed:", error);
    return <CatalogError lang={lang} />;
  }
  const contacts = await loadShopContacts();
  const reach: LfRequestContact[] = contacts.wholesale.flatMap((c) => [
    ...(c.whatsapp ? [{ label: `WhatsApp ${formatPhone(c.phone)}`, href: whatsappHref(c.phone), withText: true }] : []),
    ...(c.viber ? [{ label: `Viber ${formatPhone(c.phone)}`, href: viberHref(c.phone), withText: false }] : []),
    ...(c.telegram ? [{ label: `Telegram ${formatPhone(c.phone)}`, href: telegramHref(c.phone), withText: false }] : []),
    { label: formatPhone(c.phone), href: telHref(c.phone), withText: false },
  ]);

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 pt-5 pb-12 sm:px-6 sm:pt-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t("home"), path: "/" },
          { name: t("lfNav"), path: SHOP_LF_CATEGORY_PATH },
        ])}
      />
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href={href("/shop")}>{t("home")}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{t("lfNav")}</span>
      </nav>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("lfNav")}</h1>
        <p className="m-0 max-w-[760px] text-base leading-relaxed text-(--muted)">{lt("categoryIntro")}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 lg:grid-cols-3 lg:gap-5">
        {cards.map((p, i) => (
          <Link key={p.slug} href={href(`/shop/p/${p.slug}`)} className="group flex flex-col gap-2.5 no-underline">
            <ShopImg src={p.image} alt={p.name} eager={i < 3} className="block aspect-square w-full rounded-[14px] transition-transform group-hover:scale-[1.01]" />
            <span className="text-[15px] leading-snug font-bold sm:text-base">{p.name}</span>
            <span className="text-sm text-(--muted2)">{p.subtitle}</span>
            {p.fromPrice != null ? (
              <span className="text-[17px] font-extrabold sm:text-lg">
                {p.fixedPrice ? formatPrice(p.fromPrice, lang) : t("fromPrice", { price: formatPrice(p.fromPrice, lang) })}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
      <LfOnRequest contacts={reach} />
    </main>
  );
}
