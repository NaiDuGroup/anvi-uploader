import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/shop/JsonLd";
import { CatalogError } from "@/components/shop/CatalogError";
import { ProductCard } from "@/components/shop/ProductCard";
import { ShopImg } from "@/components/shop/ShopImg";
import { PhotoIcon } from "@/components/shop/ShopIcons";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { shopBusinessCardProduct } from "@/lib/storefront/businessCardProduct";
import { SHOP_BC_IMAGE, SHOP_BC_SLUG } from "@/lib/storefront/businessCards";
import { SHOP_POPULAR_SLUGS } from "@/lib/storefront/catalogConfig";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { shopHref } from "@/lib/storefront/shopHost";
import { SHOP_PHOTO_PRINT_URL } from "@/lib/storefront/links";
import type { ShopProduct } from "@/lib/storefront/types";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { localBusinessJsonLd, shopPageMetadata } from "@/lib/storefront/shopSeo";
import { safeHttpUrl } from "@/lib/studioInfo/studioInfo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = shopT(await getShopLang());
  // Image: the generated `opengraph-image` of /shop (logo, navy, gold).
  return shopPageMetadata({
    title: t("metaTitle"),
    description: t("metaDescription"),
    path: "/",
    lang: await getShopLang(),
    absoluteTitle: true,
    ownImage: true,
  });
}

export default async function ShopHomePage() {
  const lang = await getShopLang();
  const t = shopT(lang);
  const base = await getShopBase();
  const href = (p: string) => shopHref(base, p);
  const catalog = await tryLoadShopCatalog(lang);
  if (!catalog) return <CatalogError lang={lang} />;
  const contacts = await loadShopContacts();

  // Sold-out products keep their page but are not listed.
  const listed: ShopProduct[] = catalog.products.filter((p) => p.available);
  const bySlug = new Map(listed.map((p) => [p.slug, p]));
  const popularCatalog: ShopProduct[] = SHOP_POPULAR_SLUGS.map((s) => bySlug.get(s)).filter((p): p is ShopProduct => !!p);
  const heroImages = popularCatalog.slice(0, 4);
  // Business cards are not a catalog item: listed with the popular products.
  const popular: ShopProduct[] = [...popularCatalog, shopBusinessCardProduct(lang)];

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-12 px-4 pt-5 sm:px-6 sm:pt-8 md:gap-16">
      <JsonLd
        data={localBusinessJsonLd({
          companyName: contacts.companyName,
          idno: contacts.idno,
          address: contacts.address,
          mainPhone: contacts.mainPhone,
          mapUrl: safeHttpUrl(contacts.mapUrl),
          hours: contacts.hours,
          description: t("metaDescription"),
        })}
      />
      <section className="grid items-center gap-8 rounded-[20px] bg-(--soft) p-6 sm:p-10 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:p-12">
        <div className="flex flex-col gap-5">
          <span className="self-start rounded-full bg-(--gold) px-3 py-1.5 text-[13px] font-bold text-(--ink)">
            {t("heroBadge")}
          </span>
          <h1 className="m-0 text-[32px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px] lg:text-[52px]">
            {t("heroTitle")}
          </h1>
          <p className="m-0 max-w-[520px] text-base leading-relaxed text-(--muted) sm:text-lg">{t("heroText")}</p>
          <div className="flex flex-wrap gap-3">
            <a href="#popular" className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline">
              {t("heroCta")}
            </a>
            <Link
              href={href("/shop/companii")}
              className="rounded-xl border-[1.5px] border-(--line2) bg-white px-6 py-3.5 font-bold no-underline"
            >
              {t("heroCompanyCta")}
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-3.5">
          {heroImages.map((p, i) => (
            <Link key={p.slug} href={href(`/shop/p/${p.slug}`)} aria-label={p.name}>
              <ShopImg src={p.image} alt="" eager={i < 2} className="aspect-square w-full rounded-[14px] bg-white" />
            </Link>
          ))}
        </div>
      </section>

      <section id="catalog" aria-labelledby="h-cat" className="flex scroll-mt-4 flex-col gap-5">
        <h2 id="h-cat" className="m-0 text-2xl font-extrabold sm:text-[28px]">
          {t("categories")}
        </h2>
        <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-5">
          {catalog.categories.map((c) => (
            <Link key={c.slug} href={href(`/shop/${c.slug}`)} className="flex flex-col items-center gap-2.5 text-center no-underline">
              <ShopImg src={c.image} alt="" className="aspect-square w-full rounded-full" />
              <span className="text-sm font-bold">{c.name}</span>
            </Link>
          ))}
          <Link href={href(`/shop/${SHOP_BC_SLUG}`)} className="flex flex-col items-center gap-2.5 text-center no-underline">
            <ShopImg src={SHOP_BC_IMAGE} alt="" className="aspect-square w-full rounded-full" />
            <span className="text-sm font-bold">{t("bcNav")}</span>
          </Link>
          <a href={SHOP_PHOTO_PRINT_URL} className="flex flex-col items-center gap-2.5 text-center no-underline">
            <span className="grid aspect-square w-full place-items-center rounded-full bg-(--soft) text-(--muted)">
              <PhotoIcon size={40} />
            </span>
            <span className="text-sm font-bold">{t("photoTileTitle")}</span>
          </a>
        </div>
      </section>

      <section id="popular" aria-labelledby="h-pop" className="flex scroll-mt-4 flex-col gap-5">
        <h2 id="h-pop" className="m-0 text-2xl font-extrabold sm:text-[28px]">
          {t("popular")}
        </h2>
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 lg:grid-cols-4 lg:gap-5">
          {popular.map((p) => (
            <ProductCard key={p.slug} product={p} lang={lang} base={base} />
          ))}
        </div>
        {listed.length > popularCatalog.length ? (
          <>
            <h2 className="m-0 mt-6 text-2xl font-extrabold sm:text-[28px]">{t("allCatalog")}</h2>
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 lg:grid-cols-4 lg:gap-5">
              {listed
                .filter((p) => !SHOP_POPULAR_SLUGS.includes(p.slug))
                .map((p) => (
                  <ProductCard key={p.slug} product={p} lang={lang} base={base} />
                ))}
            </div>
          </>
        ) : null}
      </section>

      <section aria-labelledby="h-how" className="flex flex-col gap-5">
        <h2 id="h-how" className="m-0 text-2xl font-extrabold sm:text-[28px]">
          {t("howItWorks")}
        </h2>
        <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3 md:gap-5">
          {(
            [
              ["step1Title", "step1Text"],
              ["step2Title", "step2Text"],
              ["step3Title", "step3Text"],
            ] as const
          ).map(([title, text], i) => (
            <li key={title} className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-(--line) p-6">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-(--gold) font-extrabold">{i + 1}</span>
              <b className="text-lg">{t(title)}</b>
              <span className="leading-normal text-(--muted)">{t(text)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-6 rounded-[20px] bg-(--ink) p-7 text-white sm:p-11">
        <div className="flex max-w-[640px] flex-col gap-3">
          <span className="text-sm font-bold tracking-[0.08em] text-(--gold) uppercase">{t("companyEyebrow")}</span>
          <h2 className="m-0 text-[26px] leading-tight font-extrabold sm:text-[34px]">{t("companyTitle")}</h2>
          <p className="m-0 text-base leading-relaxed text-[#c9d1de] sm:text-[17px]">{t("companyText")}</p>
        </div>
        <Link href={href("/shop/companii")} className="shop-btn-gold rounded-xl bg-(--gold) px-7 py-4 font-extrabold no-underline">
          {t("companyCta")}
        </Link>
      </section>
    </main>
  );
}
