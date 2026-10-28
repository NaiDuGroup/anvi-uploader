import { describe, expect, it } from "vitest";
import { DEFAULT_UV_SETTINGS } from "@/lib/printMethods/uvSettings";
import { buildUvLineData } from "./buildUvLineData";
import type { UvLineInput, UvZoneInput } from "./uvLineInput";
import {
  computeUvConsumption,
  resolveUvZones,
  UV_CLIENT_MAIN_ZONE,
  UvLineError,
  UvLineErrorCode,
  uvInkCostsFromSlots,
  uvZonePrintPrice,
} from "./uvLineCalc";
import { INK_COSTS, PEN, SETTINGS } from "./uvTestFixtures";

const zone = (over: Partial<UvZoneInput> = {}): UvZoneInput => ({
  id: "z1",
  placement: "front",
  widthCm: 30,
  heightCm: 20,
  whiteLayers: 0,
  varnish: false,
  primer: false,
  ...over,
});

const PEN_MAIN = { included: true, printArea: PEN.printArea };

function build(input: Partial<UvLineInput>, settings = SETTINGS, customerType: "retail" | "dealer" = "retail", item = PEN) {
  const full: UvLineInput = {
    source: "stock",
    variantId: PEN.id,
    quantity: 10,
    zones: [zone()],
    ...input,
  } as UvLineInput;
  return buildUvLineData(full, customerType, {
    item: full.source === "stock" ? item : null,
    settings,
    inkCosts: INK_COSTS,
  });
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof UvLineError ? e.code : "other";
  }
  return undefined;
}

describe("uvZonePrintPrice", () => {
  it("area × rate per m², at least the zone minimum; dealer rates for dealers", () => {
    // 30×20 cm = 0.06 m².
    expect(uvZonePrintPrice(30, 20, "retail", SETTINGS)).toBe(30);
    expect(uvZonePrintPrice(30, 20, "dealer", SETTINGS)).toBe(21);
    // 50×50 = 0.25 m² — any size, no format list.
    expect(uvZonePrintPrice(50, 50, "retail", SETTINGS)).toBe(125);
    // 5×0.6 = 0.0003 m² → 0.15 by area → the zone minimum.
    expect(uvZonePrintPrice(5, 0.6, "retail", SETTINGS)).toBe(15);
    expect(uvZonePrintPrice(5, 0.6, "dealer", SETTINGS)).toBe(10);
  });

  it("works with only a rate or only a minimum, fails with neither", () => {
    expect(uvZonePrintPrice(30, 20, "retail", { ...SETTINGS, minimumZonePriceRetailMdl: 0 })).toBe(30);
    expect(uvZonePrintPrice(30, 20, "retail", { ...SETTINGS, retailPricePerSqmMdl: 0 })).toBe(15);
    expect(code(() => uvZonePrintPrice(30, 20, "retail", DEFAULT_UV_SETTINGS))).toBe(UvLineErrorCode.PriceNotSet);
  });
});

describe("resolveUvZones", () => {
  it("client item: every zone is priced from its own size", () => {
    const zones = resolveUvZones([zone(), zone({ id: "z2", widthCm: 5, heightCm: 5 })], "retail", SETTINGS, UV_CLIENT_MAIN_ZONE);
    expect(zones.map((z) => [z.unitPrintPriceMdl, z.customSize, z.includedInItem])).toEqual([
      [30, true, false],
      [15, true, false],
    ]);
  });

  it("stock item: the main zone takes the item's print parameters and is included; extra zones are charged", () => {
    const [main, extra] = resolveUvZones(
      [zone({ widthCm: 10, heightCm: 10 }), zone({ id: "z2" })],
      "retail",
      SETTINGS,
      PEN_MAIN,
    );
    expect(main).toMatchObject({ widthCm: 5, heightCm: 0.6, customSize: false, includedInItem: true, unitPrintPriceMdl: 0 });
    expect(extra).toMatchObject({ widthCm: 30, heightCm: 20, customSize: true, includedInItem: false, unitPrintPriceMdl: 30 });
  });

  it("stock item without print parameters: the main zone keeps the typed size and needs one", () => {
    const noArea = { included: true, printArea: null };
    expect(resolveUvZones([zone()], "retail", SETTINGS, noArea)[0]).toMatchObject({
      widthCm: 30,
      customSize: true,
      includedInItem: true,
      unitPrintPriceMdl: 0,
    });
    expect(code(() => resolveUvZones([zone({ widthCm: undefined })], "retail", SETTINGS, noArea))).toBe(
      UvLineErrorCode.ZoneSizeInvalid,
    );
  });

  it("an included main zone needs no print price settings; a charged zone does", () => {
    expect(resolveUvZones([zone()], "retail", DEFAULT_UV_SETTINGS, PEN_MAIN)[0]!.unitPrintPriceMdl).toBe(0);
    expect(code(() => resolveUvZones([zone(), zone({ id: "z2" })], "retail", DEFAULT_UV_SETTINGS, PEN_MAIN))).toBe(
      UvLineErrorCode.PriceNotSet,
    );
    expect(code(() => resolveUvZones([zone({ heightCm: 0 })], "retail", SETTINGS, UV_CLIENT_MAIN_ZONE))).toBe(
      UvLineErrorCode.ZoneSizeInvalid,
    );
  });

  it("underbase surcharge only for layers above the first; varnish and primer once; nothing on an included zone", () => {
    const s = { ...SETTINGS, whiteLayerSurchargePct: 10, varnishSurchargePct: 25, primerSurchargePct: 20 };
    const [z] = resolveUvZones([zone({ whiteLayers: 3, varnish: true, primer: true })], "retail", s, UV_CLIENT_MAIN_ZONE);
    // 30 lei print: 2 extra layers × 10% = 6, varnish 7.5, primer 6.
    expect(z).toMatchObject({
      unitPrintPriceMdl: 30,
      unitWhiteSurchargeMdl: 6,
      unitVarnishSurchargeMdl: 7.5,
      unitPrimerSurchargeMdl: 6,
      primer: true,
    });
    const [oneLayer] = resolveUvZones([zone({ whiteLayers: 1 })], "retail", s, UV_CLIENT_MAIN_ZONE);
    expect(oneLayer).toMatchObject({ unitWhiteSurchargeMdl: 0, unitPrimerSurchargeMdl: 0, primer: false });
    const [main] = resolveUvZones([zone({ whiteLayers: 3, varnish: true, primer: true })], "retail", s, PEN_MAIN);
    expect(main).toMatchObject({ unitPrintPriceMdl: 0, unitWhiteSurchargeMdl: 0, unitVarnishSurchargeMdl: 0, unitPrimerSurchargeMdl: 0 });
  });
});

describe("computeUvConsumption", () => {
  it("primer: area × norm × pieces, no head-cleaning waste", () => {
    const c = computeUvConsumption([{ widthCm: 10, heightCm: 10, whiteLayers: 1, varnish: false, primer: true }], 20, SETTINGS);
    expect(c.primerMl).toBeCloseTo(0.01 * 10 * 20, 6); // 2 ml
    expect(computeUvConsumption([{ widthCm: 10, heightCm: 10, whiteLayers: 1, varnish: false }], 20, SETTINGS).primerMl).toBe(0);
  });

  it("area m² × norm × layers × pieces × (1 + waste)", () => {
    // 10×10 cm = 0.01 m²; 5×5 = 0.0025 m².
    const c = computeUvConsumption(
      [
        { widthCm: 10, heightCm: 10, whiteLayers: 2, varnish: true },
        { widthCm: 5, heightCm: 5, whiteLayers: 0, varnish: false },
      ],
      100,
      SETTINGS,
    );
    expect(c.areaSqmPerPiece).toBeCloseTo(0.0125, 9);
    expect(c.cmykMl).toBeCloseTo(0.0125 * 10 * 100 * 1.15, 6); // 14.375
    expect(c.whiteMl).toBeCloseTo(0.01 * 12 * 2 * 100 * 1.15, 6); // 27.6
    expect(c.varnishMl).toBeCloseTo(0.01 * 12 * 100 * 1.15, 6); // 13.8
  });

  it("is zero for no pieces", () => {
    expect(computeUvConsumption([{ widthCm: 10, heightCm: 10, whiteLayers: 1, varnish: true }], 0, SETTINGS)).toEqual({
      areaSqmPerPiece: 0.01,
      cmykMl: 0,
      whiteMl: 0,
      varnishMl: 0,
      primerMl: 0,
    });
  });
});

describe("buildUvLineData", () => {
  it("stock item: the item price includes its main print; costs are the item and the ink", () => {
    const d = build({ zones: [zone({ whiteLayers: 1 })] });
    expect(d.item).toMatchObject({ variantId: PEN.id, sku: "ARDENES_WHITE", categoryCode: "pens" });
    expect(d.clientItem).toBeNull();
    expect(d.zones[0]).toMatchObject({ widthCm: 5, heightCm: 0.6, includedInItem: true });
    expect(d.pricing).toEqual({
      tierMinQty: 1,
      itemPriceSource: "tier",
      unitItemPriceMdl: 100,
      itemSellTotalMdl: 1000,
      printSellTotalMdl: 0,
      whiteSurchargeTotalMdl: 0,
      varnishSurchargeTotalMdl: 0,
      primerSurchargeTotalMdl: 0,
      setupFeeMdl: 0,
      minimumLineUpliftMdl: 0,
      totalSellPriceMdl: 1000,
    });
    // 5×0.6 cm = 0.0003 m² × 10 pcs × 1.15 → CMYK 0.0345 ml, white 0.0414 ml.
    expect(d.consumption.cmykMl).toBeCloseTo(0.0345, 2);
    expect(d.consumption.whiteMl).toBeCloseTo(0.0414, 2);
    expect(d.costs.itemCostMdl).toBe(40.4);
    expect(d.costs.totalCostMdl).toBeCloseTo(40.4 + d.costs.cmykInkCostMdl + d.costs.whiteInkCostMdl, 2);
    expect(d.estimatedProfitMdl).toBeCloseTo(1000 - d.costs.totalCostMdl, 2);
  });

  it("uses the run-size tier of the line quantity", () => {
    const d = build({ quantity: 50 });
    expect(d.pricing).toMatchObject({ tierMinQty: 50, unitItemPriceMdl: 90, itemSellTotalMdl: 4500 });
  });

  it("dealers pay the variant's dealer price when it is lower; else the retail tier", () => {
    expect(build({}, SETTINGS, "dealer").pricing).toMatchObject({ unitItemPriceMdl: 18, itemPriceSource: "dealer" });
    expect(build({}, SETTINGS, "dealer", { ...PEN, dealerPriceMdl: null }).pricing).toMatchObject({
      unitItemPriceMdl: 100,
      itemPriceSource: "tier",
    });
    expect(build({}, SETTINGS, "dealer", { ...PEN, dealerPriceMdl: 150 }).pricing.unitItemPriceMdl).toBe(100);
    expect(build({}, SETTINGS, "retail").pricing.unitItemPriceMdl).toBe(100);
  });

  it("an extra zone on a stock item is charged from its size", () => {
    const d = build({ zones: [zone(), zone({ id: "z2", placement: "back", widthCm: 10, heightCm: 10 })] });
    // 10×10 = 0.01 m² × 500 = 5 → zone minimum 15.
    expect(d.zones.map((z) => z.unitPrintPriceMdl)).toEqual([0, 15]);
    expect(d.pricing).toMatchObject({ printSellTotalMdl: 150, totalSellPriceMdl: 1150 });
  });

  it("client item: no item price or stock, print from the size, setup fee once", () => {
    const d = build(
      { source: "client", variantId: undefined, clientItem: { description: " бутылка 0,5 л ", notes: "" }, quantity: 3 },
      { ...SETTINGS, clientItemSetupFeeMdl: 50 },
    );
    expect(d.item).toBeNull();
    expect(d.clientItem).toEqual({ description: "бутылка 0,5 л", notes: null });
    expect(d.pricing).toMatchObject({
      tierMinQty: null,
      itemPriceSource: null,
      itemSellTotalMdl: 0,
      printSellTotalMdl: 90,
      setupFeeMdl: 50,
      totalSellPriceMdl: 140,
    });
    expect(d.costs.itemCostMdl).toBe(0);
  });

  it("client board 50×50: priced by area, no format limit", () => {
    const d = build({ source: "client", variantId: undefined, clientItem: { description: "доска" }, quantity: 1, zones: [zone({ widthCm: 50, heightCm: 50 })] });
    expect(d.pricing.totalSellPriceMdl).toBe(125);
  });

  it("raises the line to the minimum total", () => {
    const d = build(
      { source: "client", variantId: undefined, clientItem: { description: "x" }, quantity: 1, zones: [zone({ widthCm: 5, heightCm: 5 })] },
      { ...SETTINGS, minimumLineTotalMdl: 100 },
    );
    expect(d.pricing).toMatchObject({ printSellTotalMdl: 15, minimumLineUpliftMdl: 85, totalSellPriceMdl: 100 });
    expect(build({}, { ...SETTINGS, minimumLineTotalMdl: 100 }).pricing.minimumLineUpliftMdl).toBe(0);
  });

  it("surcharge totals scale with quantity", () => {
    const d = build(
      { source: "client", variantId: undefined, clientItem: { description: "x" }, quantity: 4, zones: [zone({ whiteLayers: 3, varnish: true })] },
      { ...SETTINGS, whiteLayerSurchargePct: 5, varnishSurchargePct: 10 },
    );
    // 3 layers → 2 above the first × 5% of 30 = 3 per piece.
    expect(d.zones[0]).toMatchObject({ unitWhiteSurchargeMdl: 3, unitVarnishSurchargeMdl: 3 });
    expect(d.pricing).toMatchObject({ whiteSurchargeTotalMdl: 12, varnishSurchargeTotalMdl: 12, totalSellPriceMdl: 120 + 12 + 12 });
  });

  it("primer: surcharge in the price, primer ml × stock price in the cost", () => {
    const d = build(
      { source: "client", variantId: undefined, clientItem: { description: "ручка металл" }, quantity: 10, zones: [zone({ primer: true })] },
      { ...SETTINGS, primerSurchargePct: 20 },
    );
    // 30×20 cm = 0.06 m² × 10 ml × 10 pcs = 6 ml × 5 lei.
    expect(d.consumption.primerMl).toBeCloseTo(6, 6);
    expect(d.costs.primerCostMdl).toBe(30);
    expect(d.pricing).toMatchObject({ primerSurchargeTotalMdl: 60, totalSellPriceMdl: 300 + 60 });
    expect(d.costs.totalCostMdl).toBeCloseTo(d.costs.cmykInkCostMdl + 30, 2);
  });

  it("fails for a missing or unpriced stock item", () => {
    expect(() =>
      buildUvLineData({ source: "stock", variantId: PEN.id, quantity: 1, zones: [zone()] }, "retail", {
        item: null,
        settings: SETTINGS,
        inkCosts: INK_COSTS,
      }),
    ).toThrow(UvLineErrorCode.ItemNotFound);
    expect(() =>
      buildUvLineData({ source: "stock", variantId: PEN.id, quantity: 1, zones: [zone()] }, "retail", {
        item: { ...PEN, priceTiers: [] },
        settings: SETTINGS,
        inkCosts: INK_COSTS,
      }),
    ).toThrow(UvLineErrorCode.ItemNoPrice);
  });
});

describe("uvInkCostsFromSlots", () => {
  it("blends CMYK by share over the colour slots, white and varnish from their own slot", () => {
    const costs = uvInkCostsFromSlots([
      { label: "Cyan", share: 0.2, unitCost: 1 },
      { label: "Magenta", share: 0.2, unitCost: 2 },
      { label: "Yellow", share: 0.2, unitCost: 3 },
      { label: "black", share: 0.4, unitCost: 4 },
      { label: "White", share: 0.15, unitCost: 5 },
      { label: "Varnish", share: 0.05, unitCost: 6 },
    ]);
    expect(costs.cmykPerMlMdl).toBeCloseTo((0.2 * 1 + 0.2 * 2 + 0.2 * 3 + 0.4 * 4) / 1, 9);
    expect(costs.whitePerMlMdl).toBe(5);
    expect(costs.varnishPerMlMdl).toBeCloseTo(6, 9);
  });

  it("is 0 for heads without a known cost", () => {
    expect(uvInkCostsFromSlots([{ label: "Cyan", share: 0.2, unitCost: null }])).toEqual({
      cmykPerMlMdl: 0,
      whitePerMlMdl: 0,
      varnishPerMlMdl: 0,
    });
  });
});
