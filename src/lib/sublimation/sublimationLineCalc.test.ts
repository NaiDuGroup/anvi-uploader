import { describe, expect, it } from "vitest";
import { buildSublimationLineData } from "./buildSublimationLineData";
import {
  computeSublimationConsumption,
  SublimationLineError,
  sublimationConsumableCostsFromSlots,
  sublimationUnitPrice,
} from "./sublimationLineCalc";
import { CATALOG, COSTS, KEYCHAIN, PILLOW, SETTINGS } from "./sublimationTestFixtures";
import { quoteSublimationDraft } from "./sublimationDraft";

const ctx = (item = PILLOW, settings = SETTINGS) => ({ item, settings, consumableCosts: COSTS });

describe("sublimationUnitPrice (print included in the blank price)", () => {
  it("picks the run-size tier for the line quantity", () => {
    expect(sublimationUnitPrice(KEYCHAIN, 1, "retail")).toEqual({ tierMinQty: 1, priceSource: "tier", unitPriceMdl: 100 });
    expect(sublimationUnitPrice(KEYCHAIN, 9, "retail")).toEqual({ tierMinQty: 2, priceSource: "tier", unitPriceMdl: 80 });
    expect(sublimationUnitPrice(KEYCHAIN, 12, "retail")).toEqual({ tierMinQty: 10, priceSource: "tier", unitPriceMdl: 65 });
  });

  it("dealer rule: dealerPrice when set, never above the retail tier; else the retail tier", () => {
    expect(sublimationUnitPrice(KEYCHAIN, 1, "dealer")).toMatchObject({ priceSource: "dealer", unitPriceMdl: 60 });
    expect(sublimationUnitPrice({ ...KEYCHAIN, dealerPriceMdl: 70 }, 12, "dealer")).toMatchObject({
      priceSource: "tier",
      unitPriceMdl: 65,
    });
    expect(sublimationUnitPrice(PILLOW, 2, "dealer")).toMatchObject({ priceSource: "tier", unitPriceMdl: 280 });
  });

  it("null without any price", () => {
    expect(sublimationUnitPrice({ priceTiers: [], dealerPriceMdl: 50 }, 1, "dealer")).toBeNull();
  });
});

describe("computeSublimationConsumption", () => {
  it("norm × pieces × (1 + waste); tape in metres; paper rounded up to whole sheets", () => {
    expect(computeSublimationConsumption({ paperSheets: 1, tapeCm: 80, inkMl: 2 }, 2, 10)).toEqual({
      paperSheets: 3, // 2.2 → 3 sheets
      tapeM: 1.76,
      inkMl: 4.4,
    });
    expect(computeSublimationConsumption({ paperSheets: 0.25, tapeCm: 5, inkMl: 0.1 }, 12, 0)).toEqual({
      paperSheets: 3,
      tapeM: 0.6,
      inkMl: 1.2,
    });
  });

  it("zero norms (the default) → nothing to write off", () => {
    expect(computeSublimationConsumption({ paperSheets: 0, tapeCm: 0, inkMl: 0 }, 50, 10)).toEqual({
      paperSheets: 0,
      tapeM: 0,
      inkMl: 0,
    });
  });
});

describe("buildSublimationLineData", () => {
  it("pillow ×2: tier price, category norm, consumable and blank costs, profit", () => {
    const d = buildSublimationLineData({ variantId: PILLOW.id, quantity: 2 }, "retail", ctx());
    expect(d.item).toMatchObject({ variantId: PILLOW.id, categoryCode: "pillows", sku: "PILLOW-SATIN", variantLabel: "Сатин" });
    expect(d.pricing).toEqual({ tierMinQty: 1, priceSource: "tier", unitPriceMdl: 280, totalSellPriceMdl: 560 });
    expect(d.consumption).toEqual({ paperSheets: 3, tapeM: 1.76, inkMl: 4.4 });
    expect(d.costs).toEqual({
      unitItemCostMdl: 90,
      itemCostMdl: 180,
      paperCostMdl: 6,
      tapeCostMdl: 8.8,
      inkCostMdl: 13.2,
      totalCostMdl: 208,
    });
    expect(d.estimatedProfitMdl).toBe(352);
  });

  it("keychain ×12 → tier from 10 pcs; unknown blank cost counts as 0", () => {
    const d = buildSublimationLineData({ variantId: KEYCHAIN.id, quantity: 12 }, "retail", ctx(KEYCHAIN));
    expect(d.pricing).toEqual({ tierMinQty: 10, priceSource: "tier", unitPriceMdl: 65, totalSellPriceMdl: 780 });
    expect(d.costs.itemCostMdl).toBe(0);
    expect(d.consumption).toEqual({ paperSheets: 2, tapeM: 0.66, inkMl: 1.32 });
  });

  it("a category without norms writes nothing off and costs only the blank", () => {
    const d = buildSublimationLineData({ variantId: PILLOW.id, quantity: 3 }, "retail", ctx(PILLOW, { wastePct: 10, norms: {} }));
    expect(d.consumption).toEqual({ paperSheets: 0, tapeM: 0, inkMl: 0 });
    expect(d.costs.totalCostMdl).toBe(270);
  });

  it("throws for a missing item or one without prices", () => {
    expect(() => buildSublimationLineData({ variantId: KEYCHAIN.id, quantity: 1 }, "retail", ctx(PILLOW))).toThrow(
      SublimationLineError,
    );
    expect(() =>
      buildSublimationLineData({ variantId: PILLOW.id, quantity: 1 }, "retail", ctx({ ...PILLOW, priceTiers: [] })),
    ).toThrow("subl_item_no_price");
  });
});

describe("quoteSublimationDraft (wizard)", () => {
  it("same price as the server, incomplete while quantity is missing", () => {
    expect(quoteSublimationDraft({ variantId: KEYCHAIN.id, quantityStr: "12" }, "retail", CATALOG)).toMatchObject({
      ok: true,
      data: { pricing: { totalSellPriceMdl: 780 } },
    });
    expect(quoteSublimationDraft({ variantId: KEYCHAIN.id, quantityStr: "" }, "retail", CATALOG)).toEqual({
      ok: false,
      code: "subl_incomplete",
    });
    expect(
      quoteSublimationDraft({ variantId: "00000000-0000-4000-8000-000000000999", quantityStr: "1" }, "retail", CATALOG),
    ).toEqual({ ok: false, code: "subl_item_not_found" });
  });
});

describe("sublimationConsumableCostsFromSlots", () => {
  it("ink blended by share over the six inks, paper and tape from their slot", () => {
    const ink = [
      { share: 0.2, unitCost: 1 },
      { share: 0.2, unitCost: 1 },
      { share: 0.2, unitCost: 1 },
      { share: 0.2, unitCost: 1 },
      { share: 0.1, unitCost: 2 },
      { share: 0.1, unitCost: null },
    ];
    expect(
      sublimationConsumableCostsFromSlots({ ink, paper: [{ share: null, unitCost: 1.5 }], tape: [{ share: null, unitCost: null }] }),
    ).toEqual({ paperPerSheetMdl: 1.5, tapePerMMdl: 0, inkPerMlMdl: (0.8 + 0.2) / 0.9 });
  });
});
