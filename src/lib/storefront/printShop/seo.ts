import type { Metadata } from "next";
import type { ShopLang } from "../i18n";
import { previewText, shopPageMetadata } from "../shopSeo";
import type { PsProduct } from "./config";
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
