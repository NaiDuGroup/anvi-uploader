import { computeLfFinishing, type LfEdge } from "@/lib/largeFormat/lfFinishing";
import { LF_KITS } from "@/lib/largeFormat/lfKits";
import type { ShopStringKey, ShopT } from "./i18n";
import {
  SHOP_LF_CANVAS_WRAP_CM,
  SHOP_LF_RULES,
  shopLfSizeText,
  type ShopLfMaterial,
  type ShopLfProduct,
  type ShopLfQuote,
} from "./largeFormat";

/** Names of wide-format products, materials and finishing in the visitor's language (pure, client-safe). */

export const SHOP_LF_PRODUCT_KEY: Record<ShopLfProduct, ShopStringKey> = {
  banner: "lfBanner",
  autocolant: "lfAutocolant",
  canvas: "lfCanvas",
  poster: "lfPoster",
  rollup: "lfRollup",
  xbanner: "lfXbanner",
};

export const SHOP_LF_MATERIAL_KEY: Record<ShopLfMaterial, ShopStringKey> = {
  banner: "lfMatBanner",
  oracal_matt: "lfMatOracalMatt",
  oracal_gloss: "lfMatOracalGloss",
  photo_200: "lfMatPhoto200",
  photo_230: "lfMatPhoto230",
  paper_100: "lfMatPaper100",
  canvas: "lfMatCanvas",
};

export const SHOP_LF_EDGE_KEY: Record<LfEdge, ShopStringKey> = {
  top: "lfEdgeTop",
  bottom: "lfEdgeBottom",
  left: "lfEdgeLeft",
  right: "lfEdgeRight",
};

/** «Capse la max. 50 cm (12 buc.) · Margini sudate · Buzunare: sus, jos». */
export function shopLfFinishingText(quote: ShopLfQuote, t: ShopT): string[] {
  if (!quote.finishing || quote.widthCm == null || quote.heightCm == null) return [];
  const f = computeLfFinishing(quote.finishing, quote.widthCm, quote.heightCm, 1);
  if (!f) return [];
  const parts: string[] = [];
  if (f.eyelets) {
    parts.push(
      f.eyelets.mode === "corners"
        ? t("lfEyeletsCorners")
        : t("lfEyeletsEvery", { cm: f.eyelets.spacingCm ?? 0, n: f.eyelets.countPerPiece }),
    );
  }
  if (f.hem) parts.push(t("lfHem"));
  if (f.pockets) parts.push(t("lfPockets", { edges: f.pockets.edges.map((e) => t(SHOP_LF_EDGE_KEY[e])).join(", ") }));
  return parts;
}

/** Title + options of a wide-format cart line. */
export function describeShopLfLine(quote: ShopLfQuote, t: ShopT): { slug: string; title: string; optionsText: string } {
  const rule = SHOP_LF_RULES[quote.product];
  const title: string = t(SHOP_LF_PRODUCT_KEY[quote.product]);
  if (quote.kit) {
    const k = LF_KITS[quote.kit];
    return { slug: rule.slug, title, optionsText: shopLfSizeText(k.widthCm, k.heightCm) };
  }
  const parts: string[] = [];
  if (quote.widthCm != null && quote.heightCm != null) parts.push(shopLfSizeText(quote.widthCm, quote.heightCm));
  if (quote.material && rule.materials.length > 1) parts.push(t(SHOP_LF_MATERIAL_KEY[quote.material]));
  if (quote.product === "canvas") parts.push(t("lfCanvasWrap", { cm: SHOP_LF_CANVAS_WRAP_CM }));
  parts.push(...shopLfFinishingText(quote, t));
  return { slug: rule.slug, title, optionsText: parts.join(" · ") };
}
