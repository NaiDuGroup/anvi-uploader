import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogError } from "@/components/shop/CatalogError";
import { ProductView } from "@/components/shop/ProductView";
import { findShopProduct } from "@/lib/storefront/catalog";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { shopHref } from "@/lib/storefront/shopHost";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ edit?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lang = await getShopLang();
  const found = await findShopProduct(lang, slug);
  const p = found?.product;
  return p ? { title: p.name, description: p.description } : {};
}

export default async function ShopProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const rawEdit = (await searchParams).edit;
  const editId: string | null = typeof rawEdit === "string" && rawEdit.length <= 64 ? rawEdit : null;
  const lang = await getShopLang();
  const t = shopT(lang);
  const base = await getShopBase();
  const href = (p: string) => shopHref(base, p);
  const found = await findShopProduct(lang, slug);
  if (!found) return <CatalogError lang={lang} />;
  const { product, catalog } = found;
  // Unknown (or unpublished) slug: a real 404, not a 200 page.
  if (!product) notFound();
  const category = catalog.categories.find((c) => c.slug === product.category);

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-4 pb-16 sm:px-6 sm:pt-6 md:gap-7">
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href={href("/shop")}>{t("home")}</Link>
        <span aria-hidden>/</span>
        {category ? (
          <>
            <Link href={href(`/shop/${category.slug}`)}>{category.name}</Link>
            <span aria-hidden>/</span>
          </>
        ) : null}
        <span aria-current="page">{product.name}</span>
      </nav>
      <ProductView product={product} editId={editId} />
    </main>
  );
}
