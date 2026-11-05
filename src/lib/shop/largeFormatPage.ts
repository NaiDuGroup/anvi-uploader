import "server-only";
import { cache } from "react";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { parseProductionCostsJson } from "@/lib/accounting/types";
import { LF_KITS } from "@/lib/largeFormat/lfKits";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import {
  SHOP_LF_IMAGES,
  SHOP_LF_PRODUCTS,
  SHOP_LF_RULES,
  type ShopLfProduct,
} from "@/lib/storefront/largeFormat";
import { SHOP_LF_PRODUCT_KEY } from "@/lib/storefront/largeFormatLabels";
import type { ShopLfPageData, ShopLfPageMaterial } from "@/lib/storefront/largeFormatPageData";
import { LF_PRODUCT_COPY } from "@/lib/storefront/largeFormatText";
import { pickLocalized } from "@/lib/storefront/i18n";
import type { ShopProduct } from "@/lib/storefront/types";
import { loadShopLfMaterials, type ShopLfMaterials } from "./largeFormatShop";

/**
 * What the wide-format pages show before the first quote: the materials a
 * product can use (printable width, price-list sizes with their retail
 * price), the sets and a «from» price. No cost, no stock.
 */

const loadContext = cache(async (): Promise<{ materials: ShopLfMaterials; minLineMdl: number }> => {
  const [materials, acct] = await Promise.all([
    loadShopLfMaterials(),
    getOrCreateAccountingSettings().catch(() => null),
  ]);
  const minLineMdl: number = acct ? parseProductionCostsJson(acct.productionCosts).lfMinimumLineTotalMdl : 0;
  return { materials, minLineMdl };
});

function pageData(product: ShopLfProduct, materials: ShopLfMaterials, minLineMdl: number): ShopLfPageData {
  const rule = SHOP_LF_RULES[product];
  const list: ShopLfPageMaterial[] = rule.materials.flatMap((key) => {
    const m = materials[key];
    if (!m) return [];
    const presets = m.rolls
      .flatMap((r) => r.presets.map((p) => ({ widthCm: p.widthCm, heightCm: p.heightCm, price: p.retailPriceMdl })))
      .sort((a, b) => a.widthCm * a.heightCm - b.widthCm * b.heightCm);
    return [{ key, maxPrintableWidthCm: m.maxPrintableWidthCm, wrapCm: m.wrapCm, presets: rule.sizing === "custom" ? [] : presets }];
  });
  const kits = rule.kits.map((id) => {
    const k = LF_KITS[id];
    return {
      id,
      widthCm: k.widthCm,
      heightCm: k.heightCm,
      printWidthCm: k.printWidthCm,
      printHeightCm: k.printHeightCm,
      hiddenBottomCm: k.hiddenBottomCm,
      price: k.priceMdl,
      cornerEyelets: k.cornerEyelets,
    };
  });
  const presetPrices: number[] = list.flatMap((m) => m.presets.map((p) => p.price));
  const fromPrice: number | null = kits.length
    ? Math.min(...kits.map((k) => k.price))
    : rule.sizing === "preset"
      ? presetPrices.length
        ? Math.min(...presetPrices)
        : null
      : Math.min(minLineMdl || Infinity, ...presetPrices);
  return {
    product,
    materials: list,
    kits,
    minLineMdl,
    fromPrice: fromPrice != null && Number.isFinite(fromPrice) ? fromPrice : null,
    available: kits.length > 0 || list.length > 0,
  };
}

export async function loadShopLfPageData(product: ShopLfProduct): Promise<ShopLfPageData> {
  const { materials, minLineMdl } = await loadContext();
  return pageData(product, materials, minLineMdl);
}

/** Listing cards of the wide-format products (the fields `ProductCard` reads). */
export async function loadShopLfCards(lang: ShopLang): Promise<(ShopProduct & { fixedPrice: boolean })[]> {
  const { materials, minLineMdl } = await loadContext();
  const t = shopT(lang);
  return SHOP_LF_PRODUCTS.map((product) => {
    const d = pageData(product, materials, minLineMdl);
    return {
      slug: SHOP_LF_RULES[product].slug,
      // Not read by `ProductCard`; wide format is not a stock category.
      category: "caiete",
      name: t(SHOP_LF_PRODUCT_KEY[product]),
      subtitle: pickLocalized(LF_PRODUCT_COPY[product].subtitle, lang),
      description: pickLocalized(LF_PRODUCT_COPY[product].description, lang),
      badge: null,
      fromPrice: d.fromPrice,
      unitFrom: null,
      image: SHOP_LF_IMAGES[product],
      available: d.available,
      mode: "simple",
      simpleKind: null,
      variants: [],
      dtf: null,
      editorHref: null,
      printAreaCm: null,
      /** One price only (X-banner): no «de la». */
      fixedPrice: d.kits.length === 1,
    } satisfies ShopProduct & { fixedPrice: boolean };
  });
}
