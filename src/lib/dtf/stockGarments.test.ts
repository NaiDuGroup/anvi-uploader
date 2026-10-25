import { describe, expect, it } from "vitest";
import { buildDtfLineData } from "./buildDtfLineData";
import type { DtfGarmentJson } from "./dtfDto";
import { dtfInputFromLineData } from "./dtfInputFromLineData";
import { DtfLineErrorCode } from "./dtfLineCalc";
import { dtfLineInputSchema, type DtfLineInput } from "./dtfLineInput";
import { DEFAULT_DTF_SETTINGS } from "./dtfSettings";
import { A4, CATALOG, uuid } from "./dtfTestFixtures";
import { parseDtfLineData } from "./parseDtfLineData";
import {
  DTF_ONE_SIZE,
  dtfGarmentId,
  dtfGarmentsFromStockItems,
  dtfVariantPriceTiers,
  garmentKindForCategory,
  localizedDtfName,
  parseDtfGarmentId,
  type DtfStockItemRow,
  type DtfStockVariantRow,
} from "./stockGarments";

const SOCKS_CATEGORY: DtfStockItemRow["category"] = {
  code: "socks",
  nameRo: "Șosete",
  nameRu: "Носки",
  nameEn: "Socks",
  sortOrder: 2,
  isActive: true,
  printMethods: ["dtf"],
};
const TEE_CATEGORY: DtfStockItemRow["category"] = {
  ...SOCKS_CATEGORY,
  code: "tshirts",
  nameRo: "Tricouri",
  nameRu: "Майки",
  nameEn: "T-shirts",
  sortOrder: 1,
};
const SOCK_TIERS = [
  { minQty: 1, priceMdl: 70 },
  { minQty: 10, priceMdl: 45 },
];

function variant(
  id: string,
  color: string | null,
  size: string | null,
  extra: Partial<DtfStockVariantRow> = {},
): DtfStockVariantRow {
  return {
    id,
    label: [color, size].filter(Boolean).join(" / ") || null,
    options: {
      ...(color ? { color, colorHex: color === "Negru" ? "#000000" : "#ffffff" } : {}),
      ...(size ? { size } : {}),
    },
    sortOrder: 0,
    isActive: true,
    stockQuantity: 5,
    avgCost: null,
    purchaseCost: 12,
    sellPrice: null,
    priceTiers: SOCK_TIERS,
    ...extra,
  };
}

const socks: DtfStockItemRow = {
  id: "item-socks",
  nameRo: "Șosete bumbac",
  nameRu: "Носки хлопок",
  nameEn: "",
  sortOrder: 0,
  isActive: true,
  category: SOCKS_CATEGORY,
  variants: [
    variant("v-blk-38", "Negru", "36-38", { sortOrder: 0, avgCost: 10.5 }),
    variant("v-blk-41", "negru ", "39-41", { sortOrder: 1 }),
    variant("v-wht-38", "Alb", "36-38", { sortOrder: 2 }),
    variant("v-wht-41", "Alb", "39-41", { sortOrder: 3, isActive: false }),
  ],
};

describe("garment ids", () => {
  it("round-trips item + colour and rejects legacy ids", () => {
    expect(dtfGarmentId("item-1", "negru")).toBe("item-1:negru");
    expect(parseDtfGarmentId("item-1:negru")).toEqual({ stockItemId: "item-1", colorKey: "negru" });
    expect(parseDtfGarmentId("item-1:")).toEqual({ stockItemId: "item-1", colorKey: "" });
    expect(parseDtfGarmentId(uuid(10))).toBeNull();
  });
});

describe("garmentKindForCategory", () => {
  it("maps seeded categories and falls back to other", () => {
    expect(garmentKindForCategory("tshirts")).toBe("tshirt");
    expect(garmentKindForCategory("socks")).toBe("socks");
    expect(garmentKindForCategory("bodysuits")).toBe("bodysuit");
    expect(garmentKindForCategory("hoodies")).toBe("other");
  });
});

describe("dtfVariantPriceTiers", () => {
  it("uses the variant tiers, else sellPrice from one piece, else nothing", () => {
    expect(dtfVariantPriceTiers([{ minQty: 10, priceMdl: 45 }, { minQty: 1, priceMdl: 70 }], 99)).toEqual(SOCK_TIERS);
    expect(dtfVariantPriceTiers(null, 65)).toEqual([{ minQty: 1, priceMdl: 65 }]);
    expect(dtfVariantPriceTiers([], { toString: () => "55.50" })).toEqual([{ minQty: 1, priceMdl: 55.5 }]);
    // Invalid tiers (no single-piece step) fall back too.
    expect(dtfVariantPriceTiers([{ minQty: 5, priceMdl: 40 }], 60)).toEqual([{ minQty: 1, priceMdl: 60 }]);
    expect(dtfVariantPriceTiers(null, null)).toEqual([]);
  });
});

describe("dtfGarmentsFromStockItems", () => {
  it("groups active variants of an item by colour (case-insensitive)", () => {
    const garments = dtfGarmentsFromStockItems([socks]);
    expect(garments.map((g) => [g.id, g.colorName, g.colorHex, g.variants.map((v) => v.size)])).toEqual([
      ["item-socks:negru", "Negru", "#000000", ["36-38", "39-41"]],
      ["item-socks:alb", "Alb", "#ffffff", ["36-38"]],
    ]);
    const black = garments[0]!;
    expect(black).toMatchObject({
      stockItemId: "item-socks",
      categoryCode: "socks",
      kind: "socks",
      name: "Șosete bumbac",
    });
    expect(black.variants[0]).toMatchObject({ id: "v-blk-38", stockQuantity: 5, unitCostMdl: 10.5 });
    expect(black.variants[1]?.unitCostMdl).toBe(12);
    expect(black.variants[1]?.priceTiers).toEqual(SOCK_TIERS);
  });

  it("orders by category, skips non-DTF / inactive and handles colourless one-size items", () => {
    const body: DtfStockItemRow = {
      ...socks,
      id: "item-tee",
      nameRo: "Tricou",
      category: TEE_CATEGORY,
      variants: [variant("v-one", null, null, { purchaseCost: null, priceTiers: null, sellPrice: 150 })],
    };
    const mugs: DtfStockItemRow = {
      ...socks,
      id: "item-mug",
      category: { ...SOCKS_CATEGORY, code: "mugs", printMethods: [] },
    };
    const hidden: DtfStockItemRow = { ...socks, id: "item-off", isActive: false };
    const garments = dtfGarmentsFromStockItems([socks, mugs, hidden, body]);
    expect(garments.map((g) => g.id)).toEqual(["item-tee:", "item-socks:negru", "item-socks:alb"]);
    expect(garments[0]).toMatchObject({ colorName: "", colorHex: null, kind: "tshirt" });
    expect(garments[0]?.variants).toEqual([
      {
        id: "v-one",
        size: DTF_ONE_SIZE,
        sortOrder: 0,
        stockQuantity: 5,
        unitCostMdl: null,
        priceTiers: [{ minQty: 1, priceMdl: 150 }],
      },
    ]);
  });

  it("localizes names with fallbacks", () => {
    const [g] = dtfGarmentsFromStockItems([socks]);
    expect(localizedDtfName(g!.itemNames, "ru")).toBe("Носки хлопок");
    expect(localizedDtfName(g!.itemNames, "en")).toBe("Șosete bumbac");
    expect(localizedDtfName(g!.categoryNames, "en")).toBe("Socks");
  });
});

describe("buildDtfLineData with unified garments", () => {
  const ctx = (garment: DtfGarmentJson) => ({
    garment,
    presets: CATALOG.presets,
    settings: DEFAULT_DTF_SETTINGS,
    unitCosts: { filmPerLinearMeterMdl: 0, inkPerMlMdl: 0, powderPerGramMdl: 0 },
  });
  const input = (garmentId: string, sizes: Record<string, number>): DtfLineInput =>
    dtfLineInputSchema.parse({
      garmentSource: "stock",
      garmentProductId: garmentId,
      sizes: Object.entries(sizes).map(([size, quantity]) => ({ size, quantity })),
      zones: [{ id: "z1", placement: "front", presetId: A4 }],
    });

  it("prices sizes from the colour tiers at the run size and snapshots stock ids", () => {
    const [black] = dtfGarmentsFromStockItems([socks]);
    const data = buildDtfLineData(input(black!.id, { "36-38": 6, "39-41": 4 }), "retail", ctx(black!));
    expect(data.garment).toEqual({
      garmentProductId: "item-socks:negru",
      stockItemId: "item-socks",
      categoryCode: "socks",
      kind: "socks",
      name: "Șosete bumbac",
      colorName: "Negru",
      colorHex: "#000000",
    });
    expect(data.sizes.map((s) => [s.garmentVariantId, s.unitSellPriceMdl, s.unitCostMdl])).toEqual([
      ["v-blk-38", 45, 10.5],
      ["v-blk-41", 45, 12],
    ]);
    expect(data.pricing.tierMinQty).toBe(10);
    expect(data.costs.garmentCostMdl).toBe(6 * 10.5 + 4 * 12);
  });

  it("uses each size's own tiers when sizes of a colour differ", () => {
    const mixed: DtfStockItemRow = {
      ...socks,
      variants: [
        variant("a", "Negru", "S", { sortOrder: 0 }),
        variant("b", "Negru", "XL", { sortOrder: 1, priceTiers: [{ minQty: 1, priceMdl: 80 }] }),
        variant("c", "Negru", "XXL", { sortOrder: 2, priceTiers: null, sellPrice: 90 }),
      ],
    };
    const [g] = dtfGarmentsFromStockItems([mixed]);
    const data = buildDtfLineData(input(g!.id, { S: 1, XL: 1 }), "dealer", ctx(g!));
    expect(data.sizes.map((s) => s.unitSellPriceMdl)).toEqual([70, 80]);
    expect(data.pricing.tierMinQty).toBe(1);
    expect(buildDtfLineData(input(g!.id, { XXL: 2 }), "retail", ctx(g!)).sizes[0]?.unitSellPriceMdl).toBe(90);
  });

  it("refuses a garment without prices, an unknown size or a mismatched id", () => {
    const noPrice: DtfStockItemRow = {
      ...socks,
      variants: [variant("x", "Negru", "M", { priceTiers: null, sellPrice: null })],
    };
    const [g] = dtfGarmentsFromStockItems([noPrice]);
    expect(() => buildDtfLineData(input(g!.id, { M: 1 }), "retail", ctx(g!))).toThrowError(
      DtfLineErrorCode.GarmentNoPrice,
    );
    expect(() => buildDtfLineData(input(g!.id, { L: 1 }), "retail", ctx(g!))).toThrowError(
      DtfLineErrorCode.SizeUnknown,
    );
    expect(() => buildDtfLineData(input("other:negru", { M: 1 }), "retail", ctx(g!))).toThrowError(
      DtfLineErrorCode.GarmentNotFound,
    );
  });
});

describe("lines saved before the unified stock", () => {
  const base = {
    version: 1,
    customerType: "retail",
    quantity: 1,
    zones: [
      {
        id: "z1",
        placement: "front",
        presetId: A4,
        presetLabel: "A4",
        customSize: false,
        widthCm: 21,
        heightCm: 30,
        unitListPriceMdl: 180,
        unitIncludedCreditMdl: 0,
        unitPrintPriceMdl: 180,
        unitPressFeeMdl: 0,
      },
    ],
    filmPrintableWidthCm: 32,
    filmGapCm: 1,
    consumption: { filmLinearMeters: 0.31, inkMl: 4.3, powderGrams: 6 },
    pricing: {
      tierMinQty: null,
      garmentSellTotalMdl: 0,
      printSellTotalMdl: 180,
      pressSellTotalMdl: 0,
      minimumLineUpliftMdl: 0,
      totalSellPriceMdl: 180,
    },
    costs: { garmentCostMdl: 0, filmCostMdl: 1.5, inkCostMdl: 1.3, powderCostMdl: 1, totalCostMdl: 3.8 },
    estimatedProfitMdl: 176.2,
  };

  it("still parses client-garment lines (garment null)", () => {
    const raw = {
      ...base,
      garmentSource: "client",
      garment: null,
      sizes: [{ garmentVariantId: null, size: "—", quantity: 1, unitSellPriceMdl: 0, unitCostMdl: 0 }],
    };
    const data = parseDtfLineData(JSON.parse(JSON.stringify(raw)));
    expect(data?.garment).toBeNull();
    expect(dtfInputFromLineData(data)).toMatchObject({ garmentSource: "client", garmentProductId: undefined });
  });

  it("still parses legacy stock-garment snapshots without stock ids", () => {
    const raw = {
      ...base,
      garmentSource: "stock",
      garment: { garmentProductId: uuid(10), kind: "tshirt", name: "DOGO", colorName: "White", colorHex: null },
      sizes: [{ garmentVariantId: uuid(20), size: "M", quantity: 1, unitSellPriceMdl: 280, unitCostMdl: 50 }],
    };
    const data = parseDtfLineData(raw);
    expect(data?.garment?.stockItemId).toBeUndefined();
    const reinput = dtfInputFromLineData(data);
    expect(dtfLineInputSchema.safeParse(reinput).success).toBe(true);
    expect(reinput?.garmentProductId).toBe(uuid(10));
  });
});
