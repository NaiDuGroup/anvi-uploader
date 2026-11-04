import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogError } from "@/components/shop/CatalogError";
import { ProductCard } from "@/components/shop/ProductCard";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { SHOP_CATEGORIES, isShopCategorySlug } from "@/lib/storefront/catalogConfig";
import { itemsLabel, pickLocalized, shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { shopHref } from "@/lib/storefront/shopHost";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const lang = await getShopLang();
  const c = SHOP_CATEGORIES.find((x) => x.slug === category);
  return c ? { title: pickLocalized(c.name, lang) } : {};
}

export default async function ShopCategoryPage({ params }: Props) {
  const { category } = await params;
  if (!isShopCategorySlug(category)) notFound();
  const lang = await getShopLang();
  const t = shopT(lang);
  const base = await getShopBase();
  const href = (p: string) => shopHref(base, p);
  const config = SHOP_CATEGORIES.find((c) => c.slug === category)!;
  const catalog = await tryLoadShopCatalog(lang);
  if (!catalog) return <CatalogError lang={lang} />;
  const products = catalog.products.filter((p) => p.category === category);

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 pt-5 sm:px-6 sm:pt-6">
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href={href("/shop")}>{t("home")}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{pickLocalized(config.name, lang)}</span>
      </nav>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{pickLocalized(config.name, lang)}</h1>
        <span className="text-sm text-(--muted2)">{itemsLabel(products.length, lang)}</span>
      </div>
      {products.length === 0 ? (
        <p className="text-(--muted)">{t("emptyCategory")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 lg:grid-cols-4 lg:gap-5">
          {products.map((p, i) => (
            <ProductCard key={p.slug} product={p} lang={lang} base={base} eager={i < 4} />
          ))}
        </div>
      )}
    </main>
  );
}
