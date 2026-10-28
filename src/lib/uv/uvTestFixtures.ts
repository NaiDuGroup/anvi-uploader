import { DEFAULT_UV_SETTINGS, type UvSettings } from "@/lib/printMethods/uvSettings";
import type { UvCatalogJson, UvStockItemJson } from "./dto";
import type { UvInkCosts } from "./uvLineCalc";

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** «Ручка белая»: 100 lei from 1 pc, 90 from 50 pcs, dealer 18; cost 4.04; prints 5×0.6 cm, one underbase layer. */
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
  dealerPriceMdl: 18,
  printArea: { widthCm: 5, heightCm: 0.6 },
  printNorms: { whiteLayers: 1, varnish: false, primer: false },
};

/** Print 500 lei/m² retail, 350 dealer; at least 15 / 10 lei per zone. */
export const SETTINGS: UvSettings = {
  ...DEFAULT_UV_SETTINGS,
  retailPricePerSqmMdl: 500,
  dealerPricePerSqmMdl: 350,
  minimumZonePriceRetailMdl: 15,
  minimumZonePriceDealerMdl: 10,
  cmykMlPerSqm: 10,
  whiteMlPerSqmPerLayer: 12,
  varnishMlPerSqmPerLayer: 12,
  wastePct: 15,
};

export const INK_COSTS: UvInkCosts = { cmykPerMlMdl: 2, whitePerMlMdl: 3, varnishPerMlMdl: 4, primerPerMlMdl: 5 };

export const CATALOG: UvCatalogJson = {
  items: [PEN],
  settings: SETTINGS,
  inkCosts: INK_COSTS,
};
