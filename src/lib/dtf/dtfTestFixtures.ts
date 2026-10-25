import type { DtfCatalogJson, DtfGarmentJson } from "./dtfDto";
import { emptyDtfDraft, quoteDtfDraft, type DtfDraft } from "./dtfDraft";
import { DEFAULT_DTF_SETTINGS } from "./dtfSettings";
import { defaultPriceTiers } from "./garmentPriceTiers";
import { dtfGarmentId } from "./stockGarments";
import type { DtfLineData } from "./types";

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const LOGO = uuid(1);
export const A5 = uuid(2);
export const A4 = uuid(3);
/** Unified stock item «DOGO Premium» (t-shirts category). */
export const SHIRT_ITEM = uuid(10);
export const SHIRT = dtfGarmentId(SHIRT_ITEM, "white");

export const WHITE_SHIRT: DtfGarmentJson = {
  id: SHIRT,
  stockItemId: SHIRT_ITEM,
  categoryCode: "tshirts",
  categoryNames: { ro: "Tricouri", ru: "Майки", en: "T-shirts" },
  itemNames: { ro: "DOGO Premium", ru: "DOGO Premium", en: "DOGO Premium" },
  kind: "tshirt",
  name: "DOGO Premium",
  colorName: "White",
  colorHex: "#ffffff",
  variants: ["S", "M", "L"].map((size, i) => ({
    id: uuid(20 + i),
    size,
    sortOrder: i,
    stockQuantity: 10,
    unitCostMdl: 50,
    priceTiers: defaultPriceTiers("tshirt", true),
  })),
};

export const CATALOG: DtfCatalogJson = {
  garments: [WHITE_SHIRT],
  presets: [
    { id: LOGO, label: "Logo", widthCm: 10, heightCm: 10, retailPrice: 50, dealerPrice: null, isActive: true, sortOrder: 0 },
    { id: A5, label: "A5", widthCm: 15, heightCm: 21, retailPrice: 140, dealerPrice: null, isActive: true, sortOrder: 2 },
    { id: A4, label: "A4", widthCm: 21, heightCm: 30, retailPrice: 180, dealerPrice: null, isActive: true, sortOrder: 3 },
  ],
  settings: DEFAULT_DTF_SETTINGS,
  unitCosts: { filmPerLinearMeterMdl: 4.83, inkPerMlMdl: 0.3, powderPerGramMdl: 0.18 },
};

export function withQuantities(draft: DtfDraft, quantities: Record<string, number>): DtfDraft {
  return {
    ...draft,
    sizes: draft.sizes.map((s) => ({ ...s, quantityStr: String(quantities[s.size] ?? "") })),
  };
}

/** Prices a white-shirt line with the default A4 front print. */
export function pricedDtfLine(quantities: Record<string, number>): DtfLineData {
  const quote = quoteDtfDraft(withQuantities(emptyDtfDraft(CATALOG), quantities), "retail", CATALOG);
  if (!quote.ok) throw new Error(quote.code);
  return quote.data;
}
