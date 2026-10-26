import { describe, expect, it } from "vitest";
import { buildUvLineData } from "./buildUvLineData";
import type { UvLineInput, UvZoneInput } from "./uvLineInput";
import {
  computeUvConsumption,
  resolveUvZones,
  UvLineError,
  UvLineErrorCode,
  uvInkCostsFromSlots,
} from "./uvLineCalc";
import { A5, A6, CATALOG, INK_COSTS, LOGO, PEN, SETTINGS } from "./uvTestFixtures";

const zone = (over: Partial<UvZoneInput> = {}): UvZoneInput => ({
  id: "z1",
  placement: "front",
  presetId: LOGO,
  whiteLayers: 0,
  varnish: false,
  ...over,
});

function build(input: Partial<UvLineInput>, settings = SETTINGS, customerType: "retail" | "dealer" = "retail") {
  const full: UvLineInput = {
    source: "stock",
    variantId: PEN.id,
    quantity: 10,
    zones: [zone()],
    ...input,
  } as UvLineInput;
  return buildUvLineData(full, customerType, {
    item: full.source === "stock" ? PEN : null,
    presets: CATALOG.presets,
    settings,
    inkCosts: INK_COSTS,
  });
}

describe("resolveUvZones", () => {
  it("prices a preset zone at retail, dealer at the dealer price, dealer without one at retail", () => {
    const presets = CATALOG.presets;
    expect(resolveUvZones([zone()], presets, "retail", SETTINGS, false)[0]!.unitListPriceMdl).toBe(30);
    expect(resolveUvZones([zone()], presets, "dealer", SETTINGS, false)[0]!.unitListPriceMdl).toBe(20);
    expect(resolveUvZones([zone({ presetId: A6 })], presets, "dealer", SETTINGS, false)[0]!.unitListPriceMdl).toBe(80);
  });

  it("custom size takes the smallest preset that fits, in either orientation, and keeps its own size", () => {
    const [z] = resolveUvZones(
      [zone({ presetId: null, widthCm: 14, heightCm: 6 })],
      CATALOG.presets,
      "retail",
      SETTINGS,
      false,
    );
    expect(z).toMatchObject({ presetId: A6, presetLabel: "A6", customSize: true, widthCm: 14, heightCm: 6, unitListPriceMdl: 80 });
    expect(
      resolveUvZones([zone({ presetId: null, widthCm: 21, heightCm: 14.8 })], CATALOG.presets, "retail", SETTINGS, false)[0]!
        .presetId,
    ).toBe(A5);
  });

  it("rejects missing sizes, sizes above the largest preset, unknown presets and an empty price list", () => {
    const code = (fn: () => unknown): string | undefined => {
      try {
        fn();
      } catch (e) {
        return e instanceof UvLineError ? e.code : "other";
      }
      return undefined;
    };
    const p = CATALOG.presets;
    expect(code(() => resolveUvZones([zone({ presetId: null })], p, "retail", SETTINGS, false))).toBe(UvLineErrorCode.ZoneSizeInvalid);
    expect(code(() => resolveUvZones([zone({ presetId: null, widthCm: 30, heightCm: 30 })], p, "retail", SETTINGS, false))).toBe(
      UvLineErrorCode.ZoneTooLarge,
    );
    expect(code(() => resolveUvZones([zone({ presetId: "nope" })], p, "retail", SETTINGS, false))).toBe(UvLineErrorCode.PresetNotFound);
    expect(code(() => resolveUvZones([zone()], [], "retail", SETTINGS, false))).toBe(UvLineErrorCode.NoPriceList);
  });

  it("applies the included print credit to the first zone of a stock item only, never below 0", () => {
    const s = { ...SETTINGS, includedPrintCreditMdl: 50 };
    const zones = resolveUvZones([zone({ presetId: LOGO }), zone({ id: "z2", presetId: A6 })], CATALOG.presets, "retail", s, true);
    expect(zones[0]).toMatchObject({ unitListPriceMdl: 30, unitIncludedCreditMdl: 30, unitPrintPriceMdl: 0 });
    expect(zones[1]).toMatchObject({ unitListPriceMdl: 80, unitIncludedCreditMdl: 0, unitPrintPriceMdl: 80 });
    const client = resolveUvZones([zone({ presetId: A6 })], CATALOG.presets, "retail", s, false);
    expect(client[0]).toMatchObject({ unitIncludedCreditMdl: 0, unitPrintPriceMdl: 80 });
    const partial = resolveUvZones([zone({ presetId: A6 })], CATALOG.presets, "retail", s, true);
    expect(partial[0]).toMatchObject({ unitIncludedCreditMdl: 50, unitPrintPriceMdl: 30 });
  });

  it("white surcharge is % of the full format price per layer; varnish once", () => {
    const s = { ...SETTINGS, whiteLayerSurchargePct: 10, varnishSurchargePct: 25, includedPrintCreditMdl: 80 };
    const [z] = resolveUvZones([zone({ presetId: A6, whiteLayers: 2, varnish: true })], CATALOG.presets, "retail", s, true);
    // Credit removes the print price but not the surcharges (they are on the format price).
    expect(z).toMatchObject({ unitPrintPriceMdl: 0, unitWhiteSurchargeMdl: 16, unitVarnishSurchargeMdl: 20 });
    const [plain] = resolveUvZones([zone({ presetId: A6 })], CATALOG.presets, "retail", s, false);
    expect(plain).toMatchObject({ unitWhiteSurchargeMdl: 0, unitVarnishSurchargeMdl: 0 });
  });
});

describe("computeUvConsumption", () => {
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
    });
  });
});

describe("buildUvLineData", () => {
  it("stock item: item tier price + print, costs from the variant and the inks", () => {
    const d = build({ zones: [zone({ presetId: LOGO, whiteLayers: 1 })] });
    expect(d.item).toMatchObject({ variantId: PEN.id, sku: "ARDENES_WHITE", categoryCode: "pens" });
    expect(d.clientItem).toBeNull();
    expect(d.pricing).toEqual({
      tierMinQty: 1,
      unitItemPriceMdl: 100,
      itemSellTotalMdl: 1000,
      printSellTotalMdl: 300,
      whiteSurchargeTotalMdl: 0,
      varnishSurchargeTotalMdl: 0,
      setupFeeMdl: 0,
      minimumLineUpliftMdl: 0,
      totalSellPriceMdl: 1300,
    });
    // 0.0025 m² × 10 pcs × 1.15 → CMYK 0.2875 ml, white 0.345 ml.
    expect(d.consumption).toMatchObject({ cmykMl: 0.288, whiteMl: 0.345, varnishMl: 0 });
    expect(d.costs).toEqual({
      unitItemCostMdl: 4.04,
      itemCostMdl: 40.4,
      cmykInkCostMdl: 0.58,
      whiteInkCostMdl: 1.03,
      varnishCostMdl: 0,
      totalCostMdl: 42.01,
    });
    expect(d.estimatedProfitMdl).toBe(1257.99);
  });

  it("uses the run-size tier of the line quantity", () => {
    const d = build({ quantity: 50 });
    expect(d.pricing).toMatchObject({ tierMinQty: 50, unitItemPriceMdl: 90, itemSellTotalMdl: 4500 });
  });

  it("item price does not depend on the customer type; print uses the dealer price", () => {
    const d = build({}, SETTINGS, "dealer");
    expect(d.pricing).toMatchObject({ unitItemPriceMdl: 100, printSellTotalMdl: 200 });
    expect(d.customerType).toBe("dealer");
  });

  it("included credit makes the first print free on stock items (pens priced with print)", () => {
    const d = build({ zones: [zone({ presetId: LOGO }), zone({ id: "z2", presetId: LOGO })] }, { ...SETTINGS, includedPrintCreditMdl: 30 });
    expect(d.zones.map((z) => z.unitPrintPriceMdl)).toEqual([0, 30]);
    expect(d.pricing.printSellTotalMdl).toBe(300);
  });

  it("client item: no item price or stock, setup fee once, credit ignored", () => {
    const d = build(
      { source: "client", variantId: undefined, clientItem: { description: " бутылка 0,5 л ", notes: "" }, quantity: 3 },
      { ...SETTINGS, clientItemSetupFeeMdl: 50, includedPrintCreditMdl: 30 },
    );
    expect(d.item).toBeNull();
    expect(d.clientItem).toEqual({ description: "бутылка 0,5 л", notes: null });
    expect(d.pricing).toMatchObject({
      tierMinQty: null,
      itemSellTotalMdl: 0,
      printSellTotalMdl: 90,
      setupFeeMdl: 50,
      totalSellPriceMdl: 140,
    });
    expect(d.costs.itemCostMdl).toBe(0);
  });

  it("raises the line to the minimum total", () => {
    const d = build(
      { source: "client", variantId: undefined, clientItem: { description: "x" }, quantity: 1 },
      { ...SETTINGS, minimumLineTotalMdl: 100 },
    );
    expect(d.pricing).toMatchObject({ printSellTotalMdl: 30, minimumLineUpliftMdl: 70, totalSellPriceMdl: 100 });
    expect(build({}, { ...SETTINGS, minimumLineTotalMdl: 100 }).pricing.minimumLineUpliftMdl).toBe(0);
  });

  it("surcharge totals scale with quantity", () => {
    const d = build(
      { quantity: 4, zones: [zone({ presetId: A6, whiteLayers: 3, varnish: true })] },
      { ...SETTINGS, whiteLayerSurchargePct: 5, varnishSurchargePct: 10 },
    );
    expect(d.zones[0]).toMatchObject({ unitWhiteSurchargeMdl: 12, unitVarnishSurchargeMdl: 8 });
    expect(d.pricing).toMatchObject({ whiteSurchargeTotalMdl: 48, varnishSurchargeTotalMdl: 32, totalSellPriceMdl: 400 + 320 + 48 + 32 });
  });

  it("fails for a missing or unpriced stock item", () => {
    expect(() =>
      buildUvLineData({ source: "stock", variantId: PEN.id, quantity: 1, zones: [zone()] }, "retail", {
        item: null,
        presets: CATALOG.presets,
        settings: SETTINGS,
        inkCosts: INK_COSTS,
      }),
    ).toThrow(UvLineErrorCode.ItemNotFound);
    expect(() =>
      buildUvLineData({ source: "stock", variantId: PEN.id, quantity: 1, zones: [zone()] }, "retail", {
        item: { ...PEN, priceTiers: [] },
        presets: CATALOG.presets,
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
