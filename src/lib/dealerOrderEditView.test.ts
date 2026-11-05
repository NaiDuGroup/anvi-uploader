import { describe, expect, it } from "vitest";
import { toDealerEditLine, type DealerEditLineSource } from "@/lib/dealerOrderEditView";
import { parseDtfLineData } from "@/lib/dtf/parseDtfLineData";
import { parseUvLineData } from "@/lib/uv/parseUvLineData";
import { parseSublimationLineData } from "@/lib/sublimation/parseSublimationLineData";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { parseBusinessCardLineData, businessCardTrimSize } from "@/lib/businessCard/parseBusinessCardLineData";
import { dtfDraftFromLineData } from "@/lib/dtf/dtfDraft";
import { uvDraftFromLineData } from "@/lib/uv/uvDraft";
import { sublimationDraftFromLineData } from "@/lib/sublimation/sublimationDraft";
import type { DtfCatalogJson } from "@/lib/dtf/dtfDto";
import { DTF_LINE_DATA_VERSION } from "@/lib/dtf/types";
import { UV_LINE_DATA_VERSION } from "@/lib/uv/types";
import { SUBLIMATION_LINE_DATA_VERSION } from "@/lib/sublimation/types";

/** Money / production figures that must never reach the dealer. */
const SECRET_KEY = /cost|purchase|margin|profit|consumption|ink|sellPrice|dealerPrice|unitPrice|totalSell|price/i;

/** Every key path whose key looks secret and whose value is not an empty object. */
function leakedPaths(value: unknown, path = ""): string[] {
  if (value == null || typeof value !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    const emptyObject = v != null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0;
    if (SECRET_KEY.test(k) && !emptyObject) out.push(p);
    out.push(...leakedPaths(v, p));
  }
  return out;
}

const COSTS = { garmentCostMdl: 55, filmCostMdl: 3.2, inkCostMdl: 1.1, totalCostMdl: 59.3 };
const PRICING = { unitPriceMdl: 150, totalSellPriceMdl: 1500, dealerPriceMdl: 120 };
const CONSUMPTION = { filmMeters: 0.4, inkMl: 3 };

const dtfFull = {
  version: DTF_LINE_DATA_VERSION,
  garmentSource: "stock",
  garment: { garmentProductId: "g-1", name: "Tee", purchaseCostMdl: 55, sku: "TEE-1" },
  customerType: "dealer",
  sizes: [{ size: "M", quantity: 4, unitCostMdl: 55 }, { size: "L", quantity: 6 }],
  quantity: 10,
  layoutKey: "L1",
  runQuantity: 20,
  zones: [
    { id: "z1", placement: "front", presetId: "A4", presetLabel: "A4", customSize: false, widthCm: 21, heightCm: 29.7, unitFormatPriceMdl: 100, runDiscountPct: 10 },
    { id: "z2", placement: "other", placementNote: "рукав", presetId: "A6", presetLabel: "A6", customSize: true, widthCm: 8, heightCm: 9, noPress: true },
  ],
  filmPrintableWidthCm: 58,
  filmGapCm: 0.3,
  consumption: CONSUMPTION,
  pricing: PRICING,
  costs: COSTS,
  estimatedProfitMdl: 400,
};

const uvFull = {
  version: UV_LINE_DATA_VERSION,
  source: "stock",
  technique: "transfer",
  customerType: "dealer",
  item: { variantId: "v-1", name: "Notebook", purchaseCostMdl: 30, avgPurchaseCost: 31 },
  clientItem: null,
  quantity: 3,
  zones: [{ id: "main", placement: "front", placementLabel: "", widthCm: 10, heightCm: 5, whiteLayers: 1, varnish: true, primer: false, areaCostMdl: 4 }],
  consumption: CONSUMPTION,
  pricing: { ...PRICING, priceNotSet: false },
  costs: COSTS,
  estimatedProfitMdl: 20,
};

const sublFull = {
  version: SUBLIMATION_LINE_DATA_VERSION,
  source: "client",
  customerType: "dealer",
  item: null,
  clientItem: { description: "подушка", notes: "белая", widthCm: 30, heightCm: 30, costMdl: 0 },
  quantity: 2,
  consumption: CONSUMPTION,
  pricing: PRICING,
  costs: COSTS,
};

const lfFull = {
  printWidthCm: 100,
  printHeightCm: 50,
  quantity: 2,
  customerType: "dealer",
  materialFamilyKey: "banner",
  pricingPolicy: "min_sufficient_width",
  materialSnapshot: { id: "m-1", name: "Banner 440", costPerLinearMeterMdl: 40, sellPricePerSqmMdl: 200 },
  sizePresetSnapshot: { presetId: "p-1", label: "1×0.5", priceMdl: 300 },
  finishing: { input: { eyelets: "corners" }, priceMdl: 20 },
  kit: { id: "rollup", priceMdl: 900, costMdl: 400 },
  totalSellPrice: 600,
  calculatedLinearMeters: 1.1,
  materialCostMdl: 44,
};

const bcFull = {
  quantity: 100,
  cardsPerSheet: 21,
  sheetsUsed: 5,
  cardWidthCm: 9.4,
  cardHeightCm: 5.4,
  cardTrimWidthCm: 9,
  cardTrimHeightCm: 5,
  bleedCm: 0.2,
  sides: "two",
  customerType: "dealer",
  presetId: "standard",
  paperSnapshot: { id: "paper-1", name: "Coated 300", pricePerSheetMdl: 6, costPerSheetMdl: 2 },
  layout: { cols: 3, rows: 7, marginsCm: 0.5 },
  pricePerSheetMdl: 6,
  totalSellPriceMdl: 300,
  paperCostMdl: 10,
};

function source(over: Partial<DealerEditLineSource>): DealerEditLineSource {
  return {
    id: "line-1",
    sortOrder: 0,
    productType: "paper_print",
    stockVariantId: null,
    largeFormatMaterialId: null,
    sheetPaperId: null,
    mugLayoutData: null,
    notebookLayoutData: null,
    penLayoutData: null,
    mugProductSnapshot: null,
    notebookProductSnapshot: null,
    penProductSnapshot: null,
    largeFormatLineData: null,
    businessCardLineData: null,
    dtfLineData: null,
    uvLineData: null,
    sublimationLineData: null,
    files: [{ id: "f-1", fileName: "a.png", copies: 1, color: "color", paperType: null, pageCount: null }],
    ...over,
  };
}

describe("toDealerEditLine: cost-free prefill", () => {
  const lines = [
    toDealerEditLine(source({ productType: "dtf_apparel", dtfLineData: dtfFull })),
    toDealerEditLine(source({ productType: "uv_print", uvLineData: uvFull })),
    toDealerEditLine(source({ productType: "sublimation_print", sublimationLineData: sublFull })),
    toDealerEditLine(source({ productType: "large_format_print", largeFormatLineData: lfFull, largeFormatMaterialId: "m-1" })),
    toDealerEditLine(source({ productType: "business_card", businessCardLineData: bcFull, sheetPaperId: "paper-1" })),
    toDealerEditLine(
      source({
        productType: "mug",
        stockVariantId: "v-mug",
        mugProductSnapshot: { nameRo: "Cana", nameRu: "Кружка", nameEn: "Mug", purchaseCost: 25, dealerPrice: 60, sellPrice: 90 },
      }),
    ),
  ];

  it("leaks no cost, price, margin or consumption figure", () => {
    for (const line of lines) {
      expect(leakedPaths(line)).toEqual([]);
      const text = JSON.stringify(line);
      for (const secret of ["55", "59.3", "1500", "400", "TEE-1", "costPerLinearMeter", "pricePerSheet", "purchaseCost"]) {
        expect(text.includes(secret), `${secret} in ${text}`).toBe(false);
      }
    }
  });

  it("is still accepted by the wizard's line parsers", () => {
    expect(parseDtfLineData(lines[0]!.dtfLineData)).not.toBeNull();
    expect(parseUvLineData(lines[1]!.uvLineData)).not.toBeNull();
    expect(parseSublimationLineData(lines[2]!.sublimationLineData)).not.toBeNull();
    expect(parseLargeFormatLineData(lines[3]!.largeFormatLineData)).not.toBeNull();
    expect(parseBusinessCardLineData(lines[4]!.businessCardLineData)).not.toBeNull();
  });

  it("rebuilds the same editor drafts as the full stored data", () => {
    const catalog = { garments: [], presets: [], settings: {}, unitCosts: {} } as unknown as DtfCatalogJson;
    expect(dtfDraftFromLineData(parseDtfLineData(lines[0]!.dtfLineData)!, catalog)).toEqual(
      dtfDraftFromLineData(parseDtfLineData(dtfFull)!, catalog),
    );
    expect(uvDraftFromLineData(parseUvLineData(lines[1]!.uvLineData)!)).toEqual(
      uvDraftFromLineData(parseUvLineData(uvFull)!),
    );
    expect(sublimationDraftFromLineData(parseSublimationLineData(lines[2]!.sublimationLineData)!)).toEqual(
      sublimationDraftFromLineData(parseSublimationLineData(sublFull)!),
    );
    const bc = parseBusinessCardLineData(lines[4]!.businessCardLineData)!;
    expect(businessCardTrimSize(bc)).toEqual(businessCardTrimSize(parseBusinessCardLineData(bcFull)!));
    expect(bc.paperSnapshot.id).toBe("paper-1");
    expect(bc.sides).toBe("two");
    const lf = parseLargeFormatLineData(lines[3]!.largeFormatLineData)!;
    expect(lf.materialSnapshot.id).toBe("m-1");
    expect(lf.sizePresetSnapshot?.presetId).toBe("p-1");
    expect(lf.finishing?.input).toEqual({ eyelets: "corners" });
    expect(lf.kit?.id).toBe("rollup");
    expect(lf.materialFamilyKey).toBe("banner");
  });

  it("keeps the stock variant, files and the public product name", () => {
    const mug = lines[5]!;
    expect(mug.stockVariantId).toBe("v-mug");
    expect(mug.mugProductSnapshot).toMatchObject({ nameRu: "Кружка" });
    expect(mug.files).toEqual([{ id: "f-1", fileName: "a.png", copies: 1, color: "color", paperType: null, pageCount: null }]);
  });
});
