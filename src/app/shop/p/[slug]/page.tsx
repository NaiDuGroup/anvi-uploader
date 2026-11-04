import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessCardPage } from "@/components/shop/BusinessCardPage";
import { CatalogError } from "@/components/shop/CatalogError";
import { ProductView } from "@/components/shop/ProductView";
import { SHOP_BC_SLUG } from "@/lib/storefront/businessCards";
import { findShopProduct } from "@/lib/storefront/catalog";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { shopHref } from "@/lib/storefront/shopHost";
import { formatPrice } from "@/lib/storefront/format";
import { breadcrumbJsonLd, previewText, productJsonLd, shopFromPrice, shopPageMetadata } from "@/lib/storefront/shopSeo";
import { JsonLd } from "@/components/shop/JsonLd";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ edit?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lang = await getShopLang();
  const t = shopT(lang);
  if (slug === SHOP_BC_SLUG) {
    // Same page as /carti-de-vizita: that one is canonical.
    return shopPageMetadata({
      title: t("bcTitle"),
      description: previewText(t("bcDescription")),
      path: "/carti-de-vizita",
      canonical: "/carti-de-vizita",
      lang,
    });
  }
  const found = await findShopProduct(lang, slug);
  const p = found?.product;
  if (!p) return {};
  const price: number | null = shopFromPrice(p);
  const priceText: string = price != null ? t("fromPrice", { price: formatPrice(price, lang) }) : "";
  return shopPageMetadata({
    title: p.name,
    description: previewText([priceText, p.description || p.subtitle].filter(Boolean).join(" · ")),
    path: `/p/${p.slug}`,
    lang,
    images: p.image ? [{ url: p.image, alt: p.name }] : undefined,
  });
}

export default async function ShopProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const rawEdit = (await searchParams).edit;
  const editId: string | null = typeof rawEdit === "string" && rawEdit.length <= 64 ? rawEdit : null;
  const lang = await getShopLang();
  const t = shopT(lang);
  const base = await getShopBase();
  // Business cards are not a catalog item (cart «Editează» links land here).
  if (slug === SHOP_BC_SLUG) return <BusinessCardPage lang={lang} base={base} editId={editId} />;
  const href = (p: string) => shopHref(base, p);
  const found = await findShopProduct(lang, slug);
  if (!found) return <CatalogError lang={lang} />;
  const { product, catalog } = found;
  // Unknown (or unpublished) slug: a real 404, not a 200 page.
  if (!product) notFound();
  const category = catalog.categories.find((c) => c.slug === product.category);
  const path = `/p/${product.slug}`;

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-4 pb-16 sm:px-6 sm:pt-6 md:gap-7">
      <JsonLd
        data={[
          productJsonLd(
            {
              name: product.name,
              description: product.description || product.subtitle,
              slug: product.slug,
              image: product.image,
              price: shopFromPrice(product),
              available: product.available,
              category: category?.name,
            },
            path,
          ),
          breadcrumbJsonLd([
            { name: t("home"), path: "/" },
            ...(category ? [{ name: category.name, path: `/${category.slug}` }] : []),
            { name: product.name, path },
          ]),
        ]}
      />
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
