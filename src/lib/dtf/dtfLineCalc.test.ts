import { describe, expect, it } from "vitest";
import {
  computeDtfLineTotals,
  DtfLineErrorCode,
  estimateDtfFilmLinearMeters,
  pickPresetForSize,
  presetUnitPrice,
  resolveDtfZones,
  type DtfPresetOption,
  type DtfZonePricingContext,
  type DtfZoneRequest,
} from "./dtfLineCalc";
import { DEFAULT_DTF_SETTINGS, discountedPrice, dtfRunDiscountPct, parseDtfSettingsJson } from "./dtfSettings";
import { defaultPriceTiers, tierPriceForQuantity } from "./garmentPriceTiers";
import type { DtfLineSize } from "./types";

/** Studio price list 2026-11 (page 14 + chest logo, dealer prices from the owner). */
const PRESETS: DtfPresetOption[] = [
  { id: "logo", label: "Logo 10×10", widthCm: 10, heightCm: 10, retailPrice: 100, dealerPrice: 40 },
  { id: "a6", label: "A6", widthCm: 10, heightCm: 15, retailPrice: 100, dealerPrice: 40 },
  { id: "a5", label: "A5", widthCm: 15, heightCm: 21, retailPrice: 140, dealerPrice: 60 },
  { id: "a4", label: "A4", widthCm: 21, heightCm: 30, retailPrice: 180, dealerPrice: 80 },
  { id: "a3", label: "A3", widthCm: 30, heightCm: 42, retailPrice: 220, dealerPrice: 120, dealerNoPressPrice: 90 },
];
const NO_COSTS = { filmPerLinearMeterMdl: 0, inkPerMlMdl: 0, powderPerGramMdl: 0 };

function ctx(over: Partial<DtfZonePricingContext> = {}): DtfZonePricingContext {
  return {
    customerType: "retail",
    garmentSource: "client",
    quantity: 1,
    settings: DEFAULT_DTF_SETTINGS,
    includedPrint: null,
    ...over,
  };
}

function zone(presetId: string, extra: Partial<DtfZoneRequest> = {}): DtfZoneRequest {
  return { id: `z-${presetId}`, placement: "front", presetId, ...extra };
}

function stockSizes(quantities: Record<string, number>, unitPrice: number): DtfLineSize[] {
  return Object.entries(quantities).map(([size, quantity]) => ({
    garmentVariantId: size,
    size,
    quantity,
    unitSellPriceMdl: unitPrice,
    unitCostMdl: 50,
  }));
}

const CLIENT_ONE: DtfLineSize[] = [{ garmentVariantId: null, size: "-", quantity: 1, unitSellPriceMdl: 0, unitCostMdl: 0 }];

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

describe("run-size discount", () => {
  it("steps −7 / −14 / −29 % from 2 / 10 / 50 pieces", () => {
    expect([1, 2, 9, 10, 49, 50, 500].map((q) => dtfRunDiscountPct(DEFAULT_DTF_SETTINGS, q))).toEqual([
      0, 7, 7, 14, 14, 29, 29,
    ]);
  });

  it("rounds to the 5-lei step", () => {
    expect(discountedPrice(180, 7, 5)).toBe(165);
    expect(discountedPrice(180, 7, 0)).toBe(167.4);
    expect(discountedPrice(180, 0, 5)).toBe(180);
  });

  it("gives the agreed retail table per format", () => {
    const table = PRESETS.filter((p) => p.id !== "logo").map((p) =>
      [1, 5, 20, 60].map((q) => presetUnitPrice(p, "retail", DEFAULT_DTF_SETTINGS, q)),
    );
    expect(table).toEqual([
      [100, 95, 85, 70],
      [140, 130, 120, 100],
      [180, 165, 155, 130],
      [220, 205, 190, 155],
    ]);
  });

  it("dealers pay their own fixed price", () => {
    expect([1, 20, 60].map((q) => presetUnitPrice(PRESETS[3], "dealer", DEFAULT_DTF_SETTINGS, q))).toEqual([80, 80, 80]);
  });
});

describe("resolveDtfZones", () => {
  it("applies the run discount to every zone of the line", () => {
    const zones = resolveDtfZones([zone("a4"), zone("a6", { id: "z2", placement: "back" })], PRESETS, ctx({ quantity: 12 }));
    expect(zones.map((z) => [z.unitFormatPriceMdl, z.runDiscountPct, z.unitPrintPriceMdl])).toEqual([
      [180, 14, 155],
      [100, 14, 85],
    ]);
  });

  it("credits the print included in a cap's price on the first zone only", () => {
    const included = { widthCm: 10, heightCm: 10 };
    const logo = resolveDtfZones([zone("logo")], PRESETS, ctx({ garmentSource: "stock", includedPrint: included }));
    expect(logo[0].unitPrintPriceMdl).toBe(0);
    const bigger = resolveDtfZones(
      [zone("a4"), zone("logo", { id: "z2", placement: "back" })],
      PRESETS,
      ctx({ garmentSource: "stock", includedPrint: included }),
    );
    expect(bigger.map((z) => [z.unitIncludedCreditMdl, z.unitPrintPriceMdl])).toEqual([
      [100, 80],
      [0, 100],
    ]);
  });

  it("charges every zone in full on items without an included print", () => {
    const [z] = resolveDtfZones([zone("a4")], PRESETS, ctx({ garmentSource: "stock" }));
    expect([z.unitIncludedCreditMdl, z.unitPrintPriceMdl]).toEqual([0, 180]);
  });

  it("hands an A3 to a dealer unpressed for 90", () => {
    const settings = { ...DEFAULT_DTF_SETTINGS, pressFeePerZoneMdl: 10 };
    const [z] = resolveDtfZones([zone("a3", { noPress: true })], PRESETS, ctx({ customerType: "dealer", settings }));
    expect([z.noPress, z.unitPrintPriceMdl, z.unitPressFeeMdl]).toEqual([true, 90, 0]);
  });

  it("refuses «no press» for retail, on our garment, or a format without that price", () => {
    const noPress = (presetId: string, over: Partial<DtfZonePricingContext>) => () =>
      resolveDtfZones([zone(presetId, { noPress: true })], PRESETS, ctx(over));
    expect(noPress("a3", {})).toThrowError(DtfLineErrorCode.NoPressUnavailable);
    expect(noPress("a3", { customerType: "dealer", garmentSource: "stock" })).toThrowError(
      DtfLineErrorCode.NoPressUnavailable,
    );
    expect(noPress("a4", { customerType: "dealer" })).toThrowError(DtfLineErrorCode.NoPressUnavailable);
  });

  it("classifies a custom size into the price list", () => {
    const [z] = resolveDtfZones(
      [{ id: "z1", placement: "front", presetId: null, widthCm: 23, heightCm: 20 }],
      PRESETS,
      ctx(),
    );
    expect(z).toMatchObject({ presetId: "a4", customSize: true, unitPrintPriceMdl: 180 });
  });

  it("rejects transfers wider than the film in both orientations", () => {
    const wide: DtfPresetOption = {
      id: "big", label: "Big", widthCm: 33.5, heightCm: 42, retailPrice: 300, dealerPrice: null,
    };
    expect(() => resolveDtfZones([zone("big")], [...PRESETS, wide], ctx())).toThrowError(
      DtfLineErrorCode.ZoneTooLarge,
    );
  });

  it("requires a price list", () => {
    expect(() => resolveDtfZones([zone("a4")], [], ctx())).toThrowError(DtfLineErrorCode.NoPriceList);
  });
});

describe("price list against the «Ofertă» table", () => {
  const whiteTee = defaultPriceTiers("tshirt", true);
  const A4_INCLUDED = { widthCm: 21, heightCm: 30 };

  function teeEach(quantity: number, presetId: string, customerType: "retail" | "dealer" = "retail"): number {
    const tier = tierPriceForQuantity(whiteTee, quantity)!;
    const garmentPrice: number = customerType === "dealer" ? Math.min(180, tier.priceMdl) : tier.priceMdl;
    const zones = resolveDtfZones(
      [zone(presetId)],
      PRESETS,
      ctx({ customerType, garmentSource: "stock", quantity, includedPrint: A4_INCLUDED }),
    );
    const totals = computeDtfLineTotals({
      customerType,
      garmentSource: "stock",
      sizes: stockSizes({ M: quantity }, garmentPrice),
      zones,
      tierMinQty: tier.minQty,
      settings: DEFAULT_DTF_SETTINGS,
      unitCosts: NO_COSTS,
    });
    return totals.pricing.totalSellPriceMdl / quantity;
  }

  it.each([
    [1, 280],
    [5, 260],
    [20, 240],
    [60, 200],
  ])("%i white DOGO t-shirt(s) with the included A4 cost %i each", (quantity, each) => {
    expect(teeEach(quantity, "a4")).toBe(each);
  });

  it("moves the price by the format difference either way", () => {
    expect(teeEach(1, "a3")).toBe(320);
    expect(teeEach(1, "a6")).toBe(200);
    // Same as «t-shirt 85 + A6 85» at 20 pieces.
    expect(teeEach(20, "a6")).toBe(170);
  });

  it("a dealer pays 180 for the t-shirt with A4 and the dealer difference for other sizes", () => {
    expect(teeEach(3, "a4", "dealer")).toBe(180);
    expect(teeEach(3, "a3", "dealer")).toBe(220);
    expect(teeEach(3, "a6", "dealer")).toBe(140);
  });
});

describe("computeDtfLineTotals", () => {
  it("costs garment, film, ink and powder with the purchase-based norms", () => {
    const zones = resolveDtfZones([zone("a4")], PRESETS, ctx({ garmentSource: "stock", quantity: 3 }));
    const totals = computeDtfLineTotals({
      customerType: "retail",
      garmentSource: "stock",
      sizes: stockSizes({ S: 2, M: 1 }, 95),
      zones,
      tierMinQty: 2,
      settings: DEFAULT_DTF_SETTINGS,
      unitCosts: { filmPerLinearMeterMdl: 5.79, inkPerMlMdl: 0.43, powderPerGramMdl: 0.21 },
    });
    expect(totals.pricing.totalSellPriceMdl).toBe(780);
    expect(totals.consumption.filmLinearMeters).toBeCloseTo(0.66, 2);
    expect(totals.consumption.inkMl).toBeCloseTo(0.66 * 15, 1);
    expect(totals.consumption.powderGrams).toBeCloseTo(0.66 * 10, 1);
    expect(totals.costs.garmentCostMdl).toBe(150);
  });

  it("raises a print-only line to the retail minimum", () => {
    const settings = { ...DEFAULT_DTF_SETTINGS, minimumPrintOnlyRetailMdl: 150 };
    const zones = resolveDtfZones([zone("logo")], PRESETS, ctx({ settings }));
    const totals = computeDtfLineTotals({
      customerType: "retail",
      garmentSource: "client",
      sizes: CLIENT_ONE,
      zones,
      tierMinQty: null,
      settings,
      unitCosts: NO_COSTS,
    });
    expect([totals.pricing.minimumLineUpliftMdl, totals.pricing.totalSellPriceMdl]).toEqual([50, 150]);
  });

  it("raises a dealer print-only line to the dealer minimum, not the retail one", () => {
    const settings = { ...DEFAULT_DTF_SETTINGS, minimumPrintOnlyDealerMdl: 50 };
    const zones = resolveDtfZones([zone("logo")], PRESETS, ctx({ customerType: "dealer", settings }));
    const totals = computeDtfLineTotals({
      customerType: "dealer",
      garmentSource: "client",
      sizes: CLIENT_ONE,
      zones,
      tierMinQty: null,
      settings,
      unitCosts: NO_COSTS,
    });
    expect(totals.pricing.totalSellPriceMdl).toBe(50);
  });

  it("does not apply the print-only minimum to our garments", () => {
    const settings = { ...DEFAULT_DTF_SETTINGS, minimumPrintOnlyRetailMdl: 1000 };
    const zones = resolveDtfZones([zone("logo")], PRESETS, ctx({ garmentSource: "stock", settings }));
    const totals = computeDtfLineTotals({
      customerType: "retail",
      garmentSource: "stock",
      sizes: stockSizes({ M: 1 }, 100),
      zones,
      tierMinQty: 1,
      settings,
      unitCosts: NO_COSTS,
    });
    expect(totals.pricing.minimumLineUpliftMdl).toBe(0);
  });
});

describe("price floor", () => {
  it("never lets a smaller print than included take the line below zero", () => {
    const zones = resolveDtfZones(
      [zone("logo")],
      PRESETS,
      ctx({ garmentSource: "stock", includedPrint: { widthCm: 21, heightCm: 30 } }),
    );
    const totals = computeDtfLineTotals({
      customerType: "retail",
      garmentSource: "stock",
      sizes: stockSizes({ M: 1 }, 21),
      zones,
      tierMinQty: 1,
      settings: DEFAULT_DTF_SETTINGS,
      unitCosts: NO_COSTS,
    });
    expect(totals.pricing.totalSellPriceMdl).toBe(0);
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

describe("parseDtfSettingsJson", () => {
  it("keeps valid keys, defaults the rest, clamps printable width and drops the old credit", () => {
    const s = parseDtfSettingsJson({
      filmWidthCm: 30,
      printableWidthCm: 31,
      gapCm: -1,
      pressFeePerZoneMdl: 15,
      includedPrintCreditMdl: 180,
    });
    expect(s.filmWidthCm).toBe(30);
    expect(s.printableWidthCm).toBe(30);
    expect(s.gapCm).toBe(DEFAULT_DTF_SETTINGS.gapCm);
    expect(s.pressFeePerZoneMdl).toBe(15);
    expect("includedPrintCreditMdl" in s).toBe(false);
  });
});

describe("defaultPriceTiers", () => {
  it("prices every item with its standard print (the «Ofertă» table)", () => {
    expect(defaultPriceTiers("tshirt", true).map((t) => t.priceMdl)).toEqual([280, 260, 240, 200]);
    expect(defaultPriceTiers("tshirt", false).map((t) => t.priceMdl)).toEqual([350, 320, 300, 260]);
    expect(defaultPriceTiers("cap", false).map((t) => t.priceMdl)).toEqual([180, 150, 118, 100]);
    expect(tierPriceForQuantity(defaultPriceTiers("socks", true), 50)?.priceMdl).toBe(40);
    expect(tierPriceForQuantity([], 5)).toBeNull();
  });
});
