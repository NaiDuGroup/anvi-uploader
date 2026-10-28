import type { SublimationSettings } from "@/lib/printMethods/sublimationSettings";
import type { SublimationCatalogJson, SublimationStockItemJson } from "./dto";
import type { SublimationConsumableCosts } from "./sublimationLineCalc";

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** «Подушка · Сатин»: 280 lei per piece (no run-size steps), cost 90. */
export const PILLOW: SublimationStockItemJson = {
  id: uuid(20),
  itemId: uuid(21),
  categoryCode: "pillows",
  categoryNames: { ro: "Perne", ru: "Подушки", en: "Pillows" },
  itemNames: { ro: "Pernă", ru: "Подушка", en: "Pillow" },
  name: "Pernă",
  sku: "PILLOW-SATIN",
  variantLabel: "Сатин",
  colorHex: null,
  imageUrl: null,
  stockQuantity: 5,
  unitCostMdl: 90,
  priceTiers: [{ minQty: 1, priceMdl: 280 }],
  dealerPriceMdl: null,
  printArea: null,
  printNorms: { whiteLayers: 1, varnish: false, primer: false },
};

/** «Брелок mb001»: 100 / from 2 — 80 / from 10 — 65; dealer 60; cost unknown. */
export const KEYCHAIN: SublimationStockItemJson = {
  id: uuid(30),
  itemId: uuid(31),
  categoryCode: "keychains",
  categoryNames: { ro: "Brelocuri", ru: "Брелоки", en: "Keychains" },
  itemNames: { ro: "Breloc mb001", ru: "Брелок mb001", en: "Keychain mb001" },
  name: "Breloc mb001",
  sku: "MB001",
  variantLabel: null,
  colorHex: null,
  imageUrl: null,
  stockQuantity: 0,
  unitCostMdl: null,
  priceTiers: [
    { minQty: 1, priceMdl: 100 },
    { minQty: 2, priceMdl: 80 },
    { minQty: 10, priceMdl: 65 },
  ],
  dealerPriceMdl: 60,
  printArea: null,
  printNorms: { whiteLayers: 1, varnish: false, primer: false },
};

export const SETTINGS: SublimationSettings = {
  wastePct: 10,
  norms: {
    pillows: { paperSheets: 1, tapeCm: 80, inkMl: 2 },
    keychains: { paperSheets: 0.1, tapeCm: 5, inkMl: 0.1 },
    mugs: { paperSheets: 1, tapeCm: 30, inkMl: 1 },
  },
  /** Client items: 2000 / 1500 lei per m², minimum 50 / 40 per piece, set-up 30, line minimum 150. */
  clientItem: {
    retailPricePerSqmMdl: 2000,
    dealerPricePerSqmMdl: 1500,
    minimumPriceRetailMdl: 50,
    minimumPriceDealerMdl: 40,
    setupFeeMdl: 30,
    minimumLineTotalMdl: 150,
    inkMlPerSqm: 20,
    tapeCmPerPiece: 40,
  },
};

export const COSTS: SublimationConsumableCosts = { paperPerSheetMdl: 2, tapePerMMdl: 5, inkPerMlMdl: 3 };

export const CATALOG: SublimationCatalogJson = {
  items: [PILLOW, KEYCHAIN],
  settings: SETTINGS,
  consumableCosts: COSTS,
};
