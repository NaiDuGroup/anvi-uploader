import { DEFAULT_UV_SETTINGS, type UvSettings } from "@/lib/printMethods/uvSettings";
import type { UvCatalogJson, UvStockItemJson } from "./dto";
import type { UvInkCosts } from "./uvLineCalc";

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const LOGO = uuid(1);
export const A6 = uuid(2);
export const A5 = uuid(3);

/** «Ручка белая»: 100 lei from 1 pc, 90 from 50 pcs; cost 4.04. */
export const PEN: UvStockItemJson = {
  id: uuid(10),
  itemId: uuid(11),
  categoryCode: "pens",
  categoryNames: { ro: "Pixuri", ru: "Ручки", en: "Pens" },
  itemNames: { ro: "Pix alb", ru: "Ручка белая", en: "Pen white" },
  name: "Pix alb",
  sku: "ARDENES_WHITE",
  variantLabel: null,
  colorHex: "#ffffff",
  stockQuantity: 20,
  unitCostMdl: 4.04,
  priceTiers: [
    { minQty: 1, priceMdl: 100 },
    { minQty: 50, priceMdl: 90 },
  ],
};

export const SETTINGS: UvSettings = {
  ...DEFAULT_UV_SETTINGS,
  cmykMlPerSqm: 10,
  whiteMlPerSqmPerLayer: 12,
  varnishMlPerSqmPerLayer: 12,
  wastePct: 15,
};

export const INK_COSTS: UvInkCosts = { cmykPerMlMdl: 2, whitePerMlMdl: 3, varnishPerMlMdl: 4 };

export const CATALOG: UvCatalogJson = {
  items: [PEN],
  presets: [
    { id: LOGO, label: "Logo 5×5", widthCm: 5, heightCm: 5, retailPrice: 30, dealerPrice: 20, isActive: true, sortOrder: 0 },
    { id: A6, label: "A6", widthCm: 10.5, heightCm: 14.8, retailPrice: 80, dealerPrice: null, isActive: true, sortOrder: 1 },
    { id: A5, label: "A5", widthCm: 14.8, heightCm: 21, retailPrice: 120, dealerPrice: 100, isActive: true, sortOrder: 2 },
  ],
  settings: SETTINGS,
  inkCosts: INK_COSTS,
};
