import type { WizardBootstrapData } from "./wizardBootstrap";
import { ZERO_UV_INK_COSTS } from "./uv/uvLineCalc";
import { ZERO_SUBLIMATION_CONSUMABLE_COSTS } from "./sublimation/sublimationLineCalc";
import { lfInkMarkupMultiplierUsed } from "./largeFormat/lfInkSellPricing";

/** Fields of the admin mug / notebook rows that only staff may see. */
const STAFF_ONLY_PRODUCT_KEYS = ["purchaseCost", "avgPurchaseCost", "internalNotes"] as const;

function withoutKeys<T extends object>(row: T, keys: readonly string[]): T {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const k of keys) delete out[k];
  return out as T;
}

/**
 * The wizard bundle as a dealer may see it: the same catalogs and sell prices,
 * without purchase costs, ink / consumable costs or stock levels of materials.
 *
 * Every sell price in the wizard is built from price lists, not from costs, so
 * the dealer quotes stay the same. The one exception is large-format ink: its
 * sell price is ink cost × dealer markup. The bundle carries that product as
 * the ink "cost" with a markup of 1, so the dealer sees the sell rate only
 * (the line total can differ from the server's by rounding; the server price wins).
 */
export function toDealerWizardBootstrap(data: WizardBootstrapData): WizardBootstrapData {
  const pe = data.printEconomics;
  const dealerInkMultiplier: number = lfInkMarkupMultiplierUsed("dealer", pe);
  const inkSellPerMl: number =
    dealerInkMultiplier > 0 && pe.avgInkCostPerMlMdl > 0
      ? pe.avgInkCostPerMlMdl * dealerInkMultiplier
      : 0;

  return {
    mugProducts: data.mugProducts.map((m) => withoutKeys(m, STAFF_ONLY_PRODUCT_KEYS)),
    notebookProducts: data.notebookProducts.map((n) => withoutKeys(n, STAFF_ONLY_PRODUCT_KEYS)),
    penProducts: data.penProducts,
    lfMaterials: data.lfMaterials.map((m) => ({
      ...m,
      stockLinearMeters: 0,
      avgPurchaseCostPerLinearMeter: null,
      purchaseCostPerSqmMdl: null,
      costPerLinearMeter: 0,
    })),
    sheetPapers: data.sheetPapers.map((p) => ({
      ...p,
      avgPurchaseCostPerSheet: null,
      effectiveCostPerSheet: 0,
      costPerSheet: 0,
      stockSheets: 0,
    })),
    dtfCatalog: {
      ...data.dtfCatalog,
      garments: data.dtfCatalog.garments.map((g) => ({
        ...g,
        variants: g.variants.map((v) => ({ ...v, unitCostMdl: null })),
      })),
      unitCosts: { filmPerLinearMeterMdl: 0, inkPerMlMdl: 0, powderPerGramMdl: 0 },
    },
    uvCatalog: {
      ...data.uvCatalog,
      items: data.uvCatalog.items.map((i) => ({ ...i, unitCostMdl: null })),
      inkCosts: { ...ZERO_UV_INK_COSTS, uvDtfFilmPerMeterMdl: 0 },
    },
    sublimationCatalog: {
      ...data.sublimationCatalog,
      items: data.sublimationCatalog.items.map((i) => ({ ...i, unitCostMdl: null })),
      consumableCosts: { ...ZERO_SUBLIMATION_CONSUMABLE_COSTS },
    },
    printEconomics: {
      inkMlPerSqmLargeFormatRoll: pe.inkMlPerSqmLargeFormatRoll,
      minimumOrderPriceMdl: pe.minimumOrderPriceMdl,
      avgInkCostPerMlMdl: inkSellPerMl,
      inkStockMl: 0,
      lfInkRetailMarkupMultiplier: inkSellPerMl > 0 ? 1 : 0,
      lfInkDealerMarkupMultiplier: inkSellPerMl > 0 ? 1 : 0,
      lfMinimumLineTotalMdl: pe.lfMinimumLineTotalMdl,
      bcMinimumLineTotalMdl: pe.bcMinimumLineTotalMdl,
      purchaseCostsIncludeVat: pe.purchaseCostsIncludeVat,
    },
    stickerSheetSettings: data.stickerSheetSettings,
    postcardSettings: data.postcardSettings,
    // Set prices only (retail + dealer), no costs.
    giftSetTemplates: data.giftSetTemplates,
  };
}
