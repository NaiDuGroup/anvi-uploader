import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/shop/JsonLd";
import { ProductCard } from "@/components/shop/ProductCard";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { itemsLabel, shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { shopHref } from "@/lib/storefront/shopHost";
import { breadcrumbJsonLd, previewText, shopPageMetadata } from "@/lib/storefront/shopSeo";
import { PS_CATEGORY_NAME, PS_CATEGORY_SLUG, PS_ON_REQUEST } from "@/lib/storefront/printShop/config";
import { printShopListing, withPrintShopStock } from "@/lib/storefront/printShop/listing";
import { psT } from "@/lib/storefront/printShop/text";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getShopLang();
  return shopPageMetadata({
    title: PS_CATEGORY_NAME[lang],
    description: previewText(psT(lang)("categoryIntro")),
    path: `/${PS_CATEGORY_SLUG}`,
    lang,
  });
}

/**
 * «Tipografie» / «Полиграфия» / «Print shop»: business cards, flyers,
 * postcards, invitations, menus, calendars, sticker sheets and UV-DTF
 * stickers (none is a catalog item) with the stock MEDUS desk calendar in
 * the calendar group, then what is made on request only.
 */
export default async function ShopPrintShopCategoryPage() {
  const lang = await getShopLang();
  const t = shopT(lang);
  const pt = psT(lang);
  const base = await getShopBase();
  const href = (p: string) => shopHref(base, p);
  // Stock items of the category (MEDUS desk calendar in the calendar group); without the database: the print shop only.
  const catalog = await tryLoadShopCatalog(lang);
  const products = withPrintShopStock(printShopListing(lang), catalog?.products ?? []);
  const contacts = await loadShopContacts();
  const phone: string = contacts.mainPhone;
  const name: string = PS_CATEGORY_NAME[lang];

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 pt-5 pb-16 sm:px-6 sm:pt-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t("home"), path: "/" },
          { name, path: `/${PS_CATEGORY_SLUG}` },
        ])}
      />
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href={href("/shop")}>{t("home")}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{name}</span>
      </nav>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{name}</h1>
        <span className="text-sm text-(--muted2)">{itemsLabel(products.length, lang)}</span>
      </div>
      <p className="m-0 max-w-[760px] text-base leading-relaxed text-(--muted)">{pt("categoryIntro")}</p>
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 lg:grid-cols-4 lg:gap-5">
        {products.map((p, i) => (
          <ProductCard key={p.slug} product={p} lang={lang} base={base} eager={i < 4} />
        ))}
      </div>

      <section aria-labelledby="ps-on-request" className="mt-4 flex flex-col gap-3 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6">
        <h2 id="ps-on-request" className="m-0 text-xl font-extrabold sm:text-2xl">
          {pt("onRequestTitle")}
        </h2>
        <p className="m-0 text-(--muted)">{pt("onRequestText")}</p>
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {PS_ON_REQUEST.map((r) => (
            <li key={r.name.ro} className="flex items-baseline justify-between gap-3 border-b border-(--line) py-2 text-sm">
              <span>{r.name[lang]}</span>
              <b className="shrink-0">{r.price[lang]}</b>
            </li>
          ))}
        </ul>
        {phone ? (
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="self-start font-bold underline">
            {pt("onRequestCall", { phone })}
          </a>
        ) : null}
      </section>
    </main>
  );
}
