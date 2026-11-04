import type { Metadata } from "next";
import Link from "next/link";
import { CatalogError } from "@/components/shop/CatalogError";
import { ProductView } from "@/components/shop/ProductView";
import { findShopProduct } from "@/lib/storefront/catalog";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lang = await getShopLang();
  const found = await findShopProduct(lang, slug);
  const p = found?.product;
  return p ? { title: p.name, description: p.description } : {};
}

export default async function ShopProductPage({ params }: Props) {
  const { slug } = await params;
  const lang = await getShopLang();
  const t = shopT(lang);
  const found = await findShopProduct(lang, slug);
  if (!found) return <CatalogError lang={lang} />;
  const { product, catalog } = found;
  if (!product) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
        <h1 className="m-0 text-2xl font-extrabold">{t("productNotFound")}</h1>
        <Link href="/shop" className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3 font-bold no-underline">
          {t("backToCatalog")}
        </Link>
      </main>
    );
  }
  const category = catalog.categories.find((c) => c.slug === product.category);

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-4 pb-16 sm:px-6 sm:pt-6 md:gap-7">
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href="/shop">{t("home")}</Link>
        <span aria-hidden>/</span>
        {category ? (
          <>
            <Link href={`/shop/${category.slug}`}>{category.name}</Link>
            <span aria-hidden>/</span>
          </>
        ) : null}
        <span aria-current="page">{product.name}</span>
      </nav>
      <ProductView product={product} />
    </main>
  );
}
