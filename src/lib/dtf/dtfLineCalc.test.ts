import { describe, expect, it } from "vitest";
import {
  computeDtfLineTotals,
  DtfLineErrorCode,
  estimateDtfFilmLinearMeters,
  pickPresetForSize,
  resolveDtfZones,
  type DtfPresetOption,
} from "./dtfLineCalc";
import { DEFAULT_DTF_SETTINGS, parseDtfSettingsJson } from "./dtfSettings";
import { defaultPriceTiers, tierPriceForQuantity } from "./garmentPriceTiers";
import type { DtfLineSize } from "./types";

/** Studio price list, page 14 + chest logo. */
const PRESETS: DtfPresetOption[] = [
  { id: "logo", label: "Logo 10×10", widthCm: 10, heightCm: 10, retailPrice: 50, dealerPrice: 40 },
  { id: "a6", label: "A6", widthCm: 10, heightCm: 15, retailPrice: 100, dealerPrice: null },
  { id: "a5", label: "A5", widthCm: 15, heightCm: 21, retailPrice: 140, dealerPrice: null },
  { id: "a4", label: "A4", widthCm: 21, heightCm: 30, retailPrice: 180, dealerPrice: 150 },
  { id: "a3", label: "A3", widthCm: 30, heightCm: 42, retailPrice: 220, dealerPrice: null },
];
const NO_COSTS = { filmPerLinearMeterMdl: 0, inkPerMlMdl: 0, powderPerGramMdl: 0 };

function stockSizes(quantities: Record<string, number>, unitPrice: number): DtfLineSize[] {
  return Object.entries(quantities).map(([size, quantity]) => ({
    garmentVariantId: size,
    size,
    quantity,
    unitSellPriceMdl: unitPrice,
    unitCostMdl: 50,
  }));
}

describe("pickPresetForSize", () => {
  it("picks the smallest preset containing the size in either orientation", () => {
    expect(pickPresetForSize(PRESETS, 8, 9)?.id).toBe("logo");
    expect(pickPresetForSize(PRESETS, 20, 12)?.id).toBe("a5");
    expect(pickPresetForSize(PRESETS, 23, 20)?.id).toBe("a4");
  });

  it("returns null when nothing fits", () => {
    expect(pickPresetForSize(PRESETS, 31, 45)).toBeNull();
  });
});

describe("resolveDtfZones", () => {
  it("prices client garments at the transfer list, dealer rate when set", () => {
    const zones = resolveDtfZones(
      [
        { id: "z1", placement: "front", presetId: "a4" },
        { id: "z2", placement: "back", presetId: "a5" },
      ],
      PRESETS,
      "dealer",
      DEFAULT_DTF_SETTINGS,
      false,
    );
    expect(zones.map((z) => z.unitPrintPriceMdl)).toEqual([150, 140]);
  });

  it("covers the first zone of a studio garment up to the A4 rate", () => {
    const zones = resolveDtfZones(
      [
        { id: "z1", placement: "back", presetId: "a3" },
        { id: "z2", placement: "chest_left", presetId: "logo" },
      ],
      PRESETS,
      "retail",
      DEFAULT_DTF_SETTINGS,
      true,
    );
    expect(zones.map((z) => [z.unitIncludedCreditMdl, z.unitPrintPriceMdl])).toEqual([
      [180, 40],
      [0, 50],
    ]);
  });

  it("classifies a custom size into the price list", () => {
    const [zone] = resolveDtfZones(
      [{ id: "z1", placement: "front", presetId: null, widthCm: 23, heightCm: 20 }],
      PRESETS,
      "retail",
      DEFAULT_DTF_SETTINGS,
      false,
    );
    expect(zone).toMatchObject({ presetId: "a4", customSize: true, unitPrintPriceMdl: 180 });
  });

  it("rejects transfers wider than the film in both orientations", () => {
    const wide: DtfPresetOption = {
      id: "big", label: "Big", widthCm: 33.5, heightCm: 42, retailPrice: 300, dealerPrice: null,
    };
    expect(() =>
      resolveDtfZones(
        [{ id: "z1", placement: "back", presetId: "big" }],
        [...PRESETS, wide],
        "retail",
        DEFAULT_DTF_SETTINGS,
        false,
      ),
    ).toThrowError(DtfLineErrorCode.ZoneTooLarge);
  });

  it("requires a price list", () => {
    expect(() =>
      resolveDtfZones([{ id: "z1", placement: "front", presetId: "a4" }], [], "retail", DEFAULT_DTF_SETTINGS, false),
    ).toThrowError(DtfLineErrorCode.NoPriceList);
  });
});

describe("price list against past orders", () => {
  const whiteTee = defaultPriceTiers("tshirt", true);

  it("#4665: one white t-shirt with an A4 print is 280", () => {
    const tier = tierPriceForQuantity(whiteTee, 1)!;
    const zones = resolveDtfZones([{ id: "z1", placement: "front", presetId: "a4" }], PRESETS, "retail", DEFAULT_DTF_SETTINGS, true);
    const totals = computeDtfLineTotals({
      sizes: stockSizes({ M: 1 }, tier.priceMdl),
      zones,
      tierMinQty: tier.minQty,
      settings: DEFAULT_DTF_SETTINGS,
      unitCosts: NO_COSTS,
    });
    expect(totals.pricing.totalSellPriceMdl).toBe(280);
  });

  it("#8628: twelve t-shirts fall into the 10–49 step at 240 each", () => {
    const tier = tierPriceForQuantity(whiteTee, 12)!;
    const zones = resolveDtfZones([{ id: "z1", placement: "front", presetId: "a4" }], PRESETS, "retail", DEFAULT_DTF_SETTINGS, true);
    const totals = computeDtfLineTotals({
      sizes: stockSizes({ S: 3, M: 3, L: 4, XL: 1, XXL: 1 }, tier.priceMdl),
      zones,
      tierMinQty: tier.minQty,
      settings: DEFAULT_DTF_SETTINGS,
      unitCosts: NO_COSTS,
    });
    expect(totals.pricing.tierMinQty).toBe(10);
    expect(totals.pricing.totalSellPriceMdl).toBe(2880);
  });

  it("#6642: chest logo on the client's garment is 50", () => {
    const zones = resolveDtfZones(
      [{ id: "z1", placement: "chest_left", presetId: null, widthCm: 9, heightCm: 7 }],
      PRESETS,
      "retail",
      DEFAULT_DTF_SETTINGS,
      false,
    );
    const totals = computeDtfLineTotals({
      sizes: [{ garmentVariantId: null, size: "-", quantity: 1, unitSellPriceMdl: 0, unitCostMdl: 0 }],
      zones,
      tierMinQty: null,
      settings: DEFAULT_DTF_SETTINGS,
      unitCosts: NO_COSTS,
    });
    expect(totals.pricing.totalSellPriceMdl).toBe(50);
  });
});

describe("estimateDtfFilmLinearMeters", () => {
  it("fits A4 transfers one per row on 32 cm film", () => {
    const m = estimateDtfFilmLinearMeters([{ id: "z", widthCm: 21, heightCm: 30 }], 3, DEFAULT_DTF_SETTINGS);
    // Rotated A4 is 30 wide, so 3 × (21 + 1 gap).
    expect(m).toBeCloseTo(0.66, 2);
  });

  it("scales large runs from a packed block", () => {
    const small = estimateDtfFilmLinearMeters([{ id: "z", widthCm: 10, heightCm: 10 }], 240, DEFAULT_DTF_SETTINGS);
    const large = estimateDtfFilmLinearMeters([{ id: "z", widthCm: 10, heightCm: 10 }], 480, DEFAULT_DTF_SETTINGS);
    expect(large).toBeCloseTo(small * 2, 5);
  });
});

describe("computeDtfLineTotals", () => {
  it("costs garment, film, ink and powder", () => {
    const zones = resolveDtfZones([{ id: "z1", placement: "front", presetId: "a4" }], PRESETS, "retail", DEFAULT_DTF_SETTINGS, true);
    const totals = computeDtfLineTotals({
      sizes: stockSizes({ S: 2, M: 1 }, 260),
      zones,
      tierMinQty: 2,
      settings: DEFAULT_DTF_SETTINGS,
      unitCosts: { filmPerLinearMeterMdl: 4.825, inkPerMlMdl: 0.3, powderPerGramMdl: 0.175 },
    });
    expect(totals.pricing.totalSellPriceMdl).toBe(780);
    expect(totals.consumption.filmLinearMeters).toBeCloseTo(0.66, 2);
    expect(totals.consumption.inkMl).toBeCloseTo(0.66 * 14, 1);
    expect(totals.costs.garmentCostMdl).toBe(150);
    expect(totals.costs.totalCostMdl).toBeCloseTo(
      150 + totals.costs.filmCostMdl + totals.costs.inkCostMdl + totals.costs.powderCostMdl,
      2,
    );
  });

  it("raises the line to the minimum total", () => {
    const settings = { ...DEFAULT_DTF_SETTINGS, minimumLineTotalMdl: 100 };
    const zones = resolveDtfZones([{ id: "z1", placement: "front", presetId: "logo" }], PRESETS, "retail", settings, false);
    const totals = computeDtfLineTotals({
      sizes: [{ garmentVariantId: null, size: "-", quantity: 1, unitSellPriceMdl: 0, unitCostMdl: 0 }],
      zones,
      tierMinQty: null,
      settings,
      unitCosts: NO_COSTS,
    });
    expect(totals.pricing.minimumLineUpliftMdl).toBe(50);
    expect(totals.pricing.totalSellPriceMdl).toBe(100);
  });
});

describe("parseDtfSettingsJson", () => {
  it("keeps valid keys, defaults the rest and clamps printable width", () => {
    const s = parseDtfSettingsJson({ filmWidthCm: 30, printableWidthCm: 31, gapCm: -1, pressFeePerZoneMdl: 15 });
    expect(s.filmWidthCm).toBe(30);
    expect(s.printableWidthCm).toBe(30);
    expect(s.gapCm).toBe(DEFAULT_DTF_SETTINGS.gapCm);
    expect(s.pressFeePerZoneMdl).toBe(15);
  });
});

describe("tierPriceForQuantity", () => {
  it("picks the highest step not above the run size", () => {
    const tee = defaultPriceTiers("tshirt", false);
    expect(tierPriceForQuantity(tee, 1)?.priceMdl).toBe(350);
    expect(tierPriceForQuantity(tee, 9)?.priceMdl).toBe(320);
    expect(tierPriceForQuantity(tee, 50)?.priceMdl).toBe(260);
    expect(tierPriceForQuantity([], 5)).toBeNull();
  });
});
