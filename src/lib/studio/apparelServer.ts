import "server-only";
import type { DtfGarmentJson } from "@/lib/dtf/dtfDto";
import { loadActiveDtfPresets, loadDtfSettings, loadDtfStockGarment } from "@/lib/dtf/resolveDtfLine";
import type { ShopProduct } from "@/lib/storefront/types";
import type { ApparelPricing } from "./apparel";

/**
 * Pricing data of the apparel Studio page, so the browser prices a design
 * with the server's own engine (`apparelEstimate` = `buildDtfLineData`):
 * the active DTF price list (retail only), the DTF settings and the
 * product's garment colours. Costs, dealer prices and stock balances are
 * left out (the page is public).
 */
export async function loadApparelPricing(product: Pick<ShopProduct, "dtf">): Promise<ApparelPricing | null> {
  if (!product.dtf) return null;
  try {
    const [settings, presets, garments] = await Promise.all([
      loadDtfSettings(),
      loadActiveDtfPresets(),
      Promise.all(product.dtf.colors.map((c) => loadDtfStockGarment(c.garmentId))),
    ]);
    return {
      settings,
      presets: presets.map((p) => ({ id: p.id, label: p.label, widthCm: p.widthCm, heightCm: p.heightCm, retailPrice: p.retailPrice, dealerPrice: null, dealerNoPressPrice: null })),
      garments: garments.filter((g): g is DtfGarmentJson => g != null).map(publicGarment),
    };
  } catch (e) {
    console.error("[studio] apparel pricing failed:", e);
    return null;
  }
}

/** A garment colour without costs, dealer prices or balances (retail run tiers stay: they are the shop prices). */
export function publicGarment(g: DtfGarmentJson): DtfGarmentJson {
  return {
    id: g.id,
    stockItemId: g.stockItemId,
    categoryCode: g.categoryCode,
    categoryNames: g.categoryNames,
    itemNames: g.itemNames,
    kind: g.kind,
    name: g.name,
    colorName: g.colorName,
    colorHex: g.colorHex,
    ...(g.includedPrint !== undefined ? { includedPrint: g.includedPrint } : {}),
    ...(g.maxPrint !== undefined ? { maxPrint: g.maxPrint } : {}),
    variants: g.variants.map((v) => ({ id: v.id, size: v.size, sortOrder: v.sortOrder, stockQuantity: 0, unitCostMdl: null, priceTiers: v.priceTiers })),
  };
}
