import type { Metadata } from "next";
import { shopT, type ShopLang } from "../i18n";
import { breadcrumbJsonLd, previewText, productJsonLd, shopFromPrice, shopPageMetadata, type JsonLd } from "../shopSeo";
import { PS_CATEGORY_NAME, PS_CATEGORY_SLUG, type PsProduct } from "./config";
import { psListingProduct, uvStickersListingProduct } from "./listing";
import { psT } from "./text";
import { SHOP_UV_STICKERS_SLUG } from "./uvStickers";

/** Metadata of a print-shop product page (`/p/<slug>`, canonical). Default ANVI card image (SVG illustrations do not preview). */
export function printShopPageMetadata(page: { kind: "product"; product: PsProduct } | { kind: "uv" }, lang: ShopLang): Metadata {
  if (page.kind === "uv") {
    const t = psT(lang);
    return shopPageMetadata({
      title: t("uvTitle"),
      description: previewText(t("uvDescription")),
      path: `/p/${SHOP_UV_STICKERS_SLUG}`,
      lang,
    });
  }
  const p = page.product;
  return shopPageMetadata({
    title: p.name[lang],
    description: previewText(`${p.subtitle[lang]} · ${p.description[lang]}`),
    path: `/p/${p.slug}`,
    lang,
  });
}

/** Product + breadcrumb JSON-LD of a print-shop product page (`/p/<slug>`): «from» price per piece, like catalog pages. */
export function printShopPageJsonLd(
  page: { kind: "product"; product: PsProduct } | { kind: "uv" },
  lang: ShopLang,
  env: Readonly<Record<string, string | undefined>> = process.env,
): JsonLd[] {
  const card = page.kind === "uv" ? uvStickersListingProduct(lang) : psListingProduct(page.product, lang);
  const path = `/p/${card.slug}`;
  const t = shopT(lang);
  return [
    productJsonLd(
      {
        name: card.name,
        description: card.description || card.subtitle,
        slug: card.slug,
        image: card.image,
        price: shopFromPrice(card),
        available: true,
        category: PS_CATEGORY_NAME[lang],
      },
      path,
      env,
    ),
    breadcrumbJsonLd(
      [
        { name: t("home"), path: "/" },
        { name: PS_CATEGORY_NAME[lang], path: `/${PS_CATEGORY_SLUG}` },
        { name: card.name, path },
      ],
      env,
    ),
  ];
}
