import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DTF_PRINT_METHOD } from "@/lib/dtf/stockGarments";
import { allShopSkus, mapShopCatalog, type CatalogItemRow, type CatalogPresetRow } from "./catalogConfig";
import type { ShopLang } from "./i18n";
import type { ShopCatalog, ShopProduct } from "./types";

function num(v: { toString(): string } | number | null | undefined): number | null {
  if (v == null) return null;
  const n: number = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

/** Live storefront catalog (prices, photos, variant ids) in the visitor's language; once per request. */
export const loadShopCatalog = cache(async (lang: ShopLang): Promise<ShopCatalog> => {
  const [items, presets] = await Promise.all([
    prisma.stockItem.findMany({
      where: { sku: { in: allShopSkus() }, category: { isActive: true } },
      select: {
        id: true,
        sku: true,
        isActive: true,
        imageUrl: true,
        galleryImages: true,
        variants: {
          select: { id: true, isActive: true, options: true, sellPrice: true, priceTiers: true, sortOrder: true, label: true },
        },
      },
    }),
    prisma.printPricePreset.findMany({
      where: { methodCode: DTF_PRINT_METHOD, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, widthCm: true, heightCm: true, retailPrice: true },
    }),
  ]);

  const itemRows: CatalogItemRow[] = items.map((i) => ({
    id: i.id,
    sku: i.sku,
    isActive: i.isActive,
    imageUrl: i.imageUrl,
    galleryImages: i.galleryImages,
    variants: i.variants.map((v) => ({
      id: v.id,
      isActive: v.isActive,
      options: v.options,
      sellPrice: num(v.sellPrice),
      priceTiers: v.priceTiers,
      sortOrder: v.sortOrder,
      label: v.label,
    })),
  }));
  const presetRows: CatalogPresetRow[] = presets.map((p) => ({
    id: p.id,
    label: p.label,
    widthCm: num(p.widthCm) ?? 0,
    heightCm: num(p.heightCm) ?? 0,
    retailPrice: num(p.retailPrice) ?? 0,
  }));
  return mapShopCatalog(itemRows, presetRows, lang);
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
