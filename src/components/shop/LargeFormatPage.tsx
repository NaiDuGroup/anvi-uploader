import Link from "next/link";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import { SHOP_LF_CATEGORY_PATH, SHOP_LF_IMAGES, SHOP_LF_RULES, type ShopLfProduct } from "@/lib/storefront/largeFormat";
import { SHOP_LF_PRODUCT_KEY } from "@/lib/storefront/largeFormatLabels";
import { LF_PRODUCT_COPY } from "@/lib/storefront/largeFormatText";
import { pickLocalized } from "@/lib/storefront/i18n";
import { shopHref } from "@/lib/storefront/shopHost";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/storefront/shopSeo";
import type { ShopLfPageData } from "@/lib/storefront/largeFormatPageData";
import { JsonLd } from "./JsonLd";
import { LargeFormatView } from "./LargeFormatView";

/** A wide-format product page body (served at `/p/<slug>`). */
export function LargeFormatPage({
  lang,
  base,
  product,
  data,
  editId,
}: {
  lang: ShopLang;
  base: "" | "/shop";
  product: ShopLfProduct;
  data: ShopLfPageData;
  editId: string | null;
}) {
  const t = shopT(lang);
  const href = (p: string) => shopHref(base, p);
  const name: string = t(SHOP_LF_PRODUCT_KEY[product]);
  const path = `/p/${SHOP_LF_RULES[product].slug}`;
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-4 pb-16 sm:px-6 sm:pt-6 md:gap-7">
      <JsonLd
        data={[
          productJsonLd(
            {
              name,
              description: pickLocalized(LF_PRODUCT_COPY[product].description, lang),
              slug: SHOP_LF_RULES[product].slug,
              image: SHOP_LF_IMAGES[product],
              price: data.fromPrice,
              available: data.available,
              category: t("lfNav"),
            },
            path,
          ),
          breadcrumbJsonLd([
            { name: t("home"), path: "/" },
            { name: t("lfNav"), path: SHOP_LF_CATEGORY_PATH },
            { name, path },
          ]),
        ]}
      />
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href={href("/shop")}>{t("home")}</Link>
        <span aria-hidden>/</span>
        <Link href={href(`/shop${SHOP_LF_CATEGORY_PATH}`)}>{t("lfNav")}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{name}</span>
      </nav>
      <LargeFormatView data={data} editId={editId} />
    </main>
  );
}
