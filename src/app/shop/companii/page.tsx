import type { Metadata } from "next";
import Link from "next/link";
import { CompanyRequestForm } from "@/components/shop/CompanyRequestForm";
import { ProductCard } from "@/components/shop/ProductCard";
import { ShopImg } from "@/components/shop/ShopImg";
import { TurnstileScope } from "@/components/turnstile/TurnstileScope";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { shopBusinessCardProduct } from "@/lib/storefront/businessCardProduct";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { CORP_INTEREST_LABEL, corpT } from "@/lib/storefront/corporateText";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { SHOP_LF_IMAGES, SHOP_LF_RULES } from "@/lib/storefront/largeFormat";
import { printShopListing } from "@/lib/storefront/printShop/listing";
import { getShopBase } from "@/lib/storefront/shopBase";
import { shopHref } from "@/lib/storefront/shopHost";
import { shopPageMetadata } from "@/lib/storefront/shopSeo";
import { contactName } from "@/lib/storefront/studioText";
import type { ShopCategorySlug, ShopProduct } from "@/lib/storefront/types";
import { formatPhone, telHref, telegramHref, viberHref, whatsappHref } from "@/lib/studioInfo/studioInfo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getShopLang();
  const t = shopT(lang);
  return shopPageMetadata({ title: t("companiesTitle"), description: t("companiesText"), path: "/companii", lang });
}

/** Catalog categories shown as corporate examples, in this order (first listed product of each). */
const EXAMPLE_CATEGORIES: readonly ShopCategorySlug[] = ["cani", "caiete", "pixuri", "tricouri", "genti"];

export default async function ShopCompaniesPage() {
  const lang = await getShopLang();
  const t = shopT(lang);
  const c = corpT(lang);
  const base = await getShopBase();
  const href = (p: string) => shopHref(base, p);
  const [contacts, catalog] = await Promise.all([loadShopContacts(), tryLoadShopCatalog(lang)]);

  // Corporate examples from the live catalog: mugs, notebooks, pens, T-shirts, bags,
  // then business cards and flyers (print shop); banners get their own tile.
  const listed: ShopProduct[] = catalog?.products.filter((p) => p.available) ?? [];
  const examples: ShopProduct[] = [
    ...EXAMPLE_CATEGORIES.map((cat) => listed.find((p) => p.category === cat && p.image)).filter(
      (p): p is ShopProduct => !!p,
    ),
    shopBusinessCardProduct(lang),
    ...printShopListing(lang).filter((p) => p.slug === "flyere"),
  ];

  // Where to write besides the form: e-mail if stored, else the phone + Viber.
  const reach = [
    ...(contacts.email ? [{ label: contacts.email, href: `mailto:${contacts.email}` }] : []),
    ...contacts.wholesale.flatMap((ct) => [
      { label: formatPhone(ct.phone), href: telHref(ct.phone) },
      ...(ct.viber ? [{ label: `Viber ${formatPhone(ct.phone)}`, href: viberHref(ct.phone) }] : []),
    ]),
  ];

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-12 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_460px]">
        <div className="flex flex-col gap-6">
          <span className="self-start rounded-full bg-(--gold) px-3 py-1.5 text-[13px] font-bold">{t("companyEyebrow")}</span>
          <h1 className="m-0 text-[30px] leading-tight font-extrabold sm:text-[44px]">{c("pitchTitle")}</h1>
          <p className="m-0 max-w-[640px] text-base leading-relaxed text-(--muted) sm:text-lg">{c("pitchText")}</p>
          <a href="#cerere" className="shop-btn-dark self-start rounded-xl bg-(--ink) px-6 py-3.5 font-bold text-white no-underline lg:hidden">
            {c("formTitle")}
          </a>

          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
            {(
              [
                ["benefit1Title", "benefit1Text"],
                ["benefit2Title", "benefit2Text"],
                ["benefit3Title", "benefit3Text"],
              ] as const
            ).map(([title, text]) => (
              <li key={title} className="flex flex-col gap-1.5 rounded-2xl bg-(--soft) p-4">
                <b>{c(title)}</b>
                <span className="text-sm leading-normal text-(--muted)">{c(text)}</span>
              </li>
            ))}
          </ul>

          <section aria-labelledby="co-steps" className="flex flex-col gap-3">
            <h2 id="co-steps" className="m-0 text-xl font-extrabold">
              {c("stepsTitle")}
            </h2>
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {(["step1", "step2", "step3"] as const).map((k, i) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-(--gold) font-extrabold">{i + 1}</span>
                  <span>{c(k)}</span>
                </li>
              ))}
            </ol>
          </section>

          {contacts.wholesale.length ? (
            <div className="flex flex-col gap-3">
              <b>{t("companiesContact")}</b>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {contacts.wholesale.map((ct) => (
                  <li key={ct.phone} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <a href={telHref(ct.phone)} className="text-lg font-extrabold">
                      {formatPhone(ct.phone)}
                    </a>
                    {ct.name ? <span className="text-(--muted)">{contactName(ct.name, lang)}</span> : null}
                    {ct.viber ? <a href={viberHref(ct.phone)} className="inline-flex min-h-10 items-center rounded-lg bg-(--soft) px-3 text-sm font-bold no-underline">Viber</a> : null}
                    {ct.whatsapp ? <a href={whatsappHref(ct.phone)} className="inline-flex min-h-10 items-center rounded-lg bg-(--soft) px-3 text-sm font-bold no-underline">WhatsApp</a> : null}
                    {ct.telegram ? <a href={telegramHref(ct.phone)} className="inline-flex min-h-10 items-center rounded-lg bg-(--soft) px-3 text-sm font-bold no-underline">Telegram</a> : null}
                  </li>
                ))}
              </ul>
              {contacts.address ? <span className="text-(--muted)">{contacts.address}</span> : null}
            </div>
          ) : null}
        </div>
        <CompanyRequestForm contacts={reach} />
      </div>

      <section aria-labelledby="co-examples" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h2 id="co-examples" className="m-0 text-2xl font-extrabold sm:text-[28px]">
            {c("examplesTitle")}
          </h2>
          <p className="m-0 text-(--muted)">{c("examplesText")}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 lg:grid-cols-4 lg:gap-5">
          {examples.map((p) => (
            <ProductCard key={p.slug} product={p} lang={lang} base={base} />
          ))}
          <Link href={href(`/shop/p/${SHOP_LF_RULES.banner.slug}`)} className="group flex flex-col gap-2.5 no-underline">
            <ShopImg
              src={SHOP_LF_IMAGES.banner}
              alt={CORP_INTEREST_LABEL.banners[lang]}
              className="block aspect-square w-full rounded-[14px] transition-transform group-hover:scale-[1.01]"
            />
            <span className="text-[15px] leading-snug font-bold sm:text-base">{CORP_INTEREST_LABEL.banners[lang]}</span>
          </Link>
        </div>
      </section>
      <TurnstileScope action="corporate" lang={lang} />
    </main>
  );
}
