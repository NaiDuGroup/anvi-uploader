import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DTF_PRINT_METHOD } from "@/lib/dtf/stockGarments";
import { loadDtfSettings } from "@/lib/dtf/resolveDtfLine";
import type { DtfSettings } from "@/lib/dtf/dtfSettings";
import {
  allShopSkus,
  mapShopCatalog,
  type CatalogDtfPricing,
  type CatalogItemRow,
  type CatalogPresetRow,
} from "./catalogConfig";
import type { ShopLang } from "./i18n";
import type { ShopCatalog, ShopProduct } from "./types";

function num(v: { toString(): string } | number | null | undefined): number | null {
  if (v == null) return null;
  const n: number = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

/** DTF settings → what the product pages show about print prices (run discount, press fee). */
export function shopDtfPricing(settings: DtfSettings): CatalogDtfPricing {
  const steps = (
    [
      [settings.runDiscount1MinQty, settings.runDiscount1Pct],
      [settings.runDiscount2MinQty, settings.runDiscount2Pct],
      [settings.runDiscount3MinQty, settings.runDiscount3Pct],
    ] as const
  )
    .filter(([minQty, pct]) => minQty > 0 && pct > 0)
    .map(([minQty, pct]) => ({ minQty, pct }))
    .sort((a, b) => a.minQty - b.minQty);
  return {
    printDiscount: steps.length ? { steps, roundTo: settings.runDiscountRoundToMdl } : null,
    pressFeeMdl: settings.pressFeePerZoneMdl,
  };
}

/** Live storefront catalog (prices, photos, variant ids) in the visitor's language; once per request. */
export const loadShopCatalog = cache(async (lang: ShopLang): Promise<ShopCatalog> => {
  const [items, presets, dtfSettings] = await Promise.all([
    prisma.stockItem.findMany({
      where: { sku: { in: allShopSkus() }, category: { isActive: true } },
      select: {
        id: true,
        sku: true,
        isActive: true,
        imageUrl: true,
        galleryImages: true,
        attributes: true,
        variants: {
          select: {
            id: true,
            isActive: true,
            options: true,
            sellPrice: true,
            priceTiers: true,
            sortOrder: true,
            label: true,
            stockQuantity: true,
          },
        },
      },
    }),
    prisma.printPricePreset.findMany({
      where: { methodCode: DTF_PRINT_METHOD, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, widthCm: true, heightCm: true, retailPrice: true },
    }),
    loadDtfSettings().catch((error: unknown) => {
      console.error("[shop] dtf settings failed:", error);
      return null;
    }),
  ]);

  const itemRows: CatalogItemRow[] = items.map((i) => ({
    id: i.id,
    sku: i.sku,
    isActive: i.isActive,
    imageUrl: i.imageUrl,
    galleryImages: i.galleryImages,
    attributes: i.attributes,
    variants: i.variants.map((v) => ({
      id: v.id,
      isActive: v.isActive,
      options: v.options,
      sellPrice: num(v.sellPrice),
      priceTiers: v.priceTiers,
      sortOrder: v.sortOrder,
      label: v.label,
      stockQuantity: num(v.stockQuantity),
    })),
  }));
  const presetRows: CatalogPresetRow[] = presets.map((p) => ({
    id: p.id,
    label: p.label,
    widthCm: num(p.widthCm) ?? 0,
    heightCm: num(p.heightCm) ?? 0,
    retailPrice: num(p.retailPrice) ?? 0,
  }));
  return mapShopCatalog(itemRows, presetRows, lang, dtfSettings ? shopDtfPricing(dtfSettings) : undefined);
});

/** The catalog, or null when the database cannot be reached (pages show an error state). */
export async function tryLoadShopCatalog(lang: ShopLang): Promise<ShopCatalog | null> {
  try {
    return await loadShopCatalog(lang);
  } catch (error) {
    console.error("[shop] catalog failed:", error);
    return null;
  }
}

export async function findShopProduct(lang: ShopLang, slug: string): Promise<{ product: ShopProduct | null; catalog: ShopCatalog } | null> {
  const catalog = await tryLoadShopCatalog(lang);
  if (!catalog) return null;
  return { product: catalog.products.find((p) => p.slug === slug) ?? null, catalog };
}
