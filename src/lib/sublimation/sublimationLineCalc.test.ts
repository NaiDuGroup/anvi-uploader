import { describe, expect, it } from "vitest";
import { buildSublimationLineData } from "./buildSublimationLineData";
import {
  computeSublimationConsumption,
  SublimationLineError,
  sublimationConsumableCostsFromSlots,
  sublimationUnitPrice,
} from "./sublimationLineCalc";
import { CATALOG, COSTS, KEYCHAIN, PILLOW, SETTINGS } from "./sublimationTestFixtures";
import { emptySublimationDraft, quoteSublimationDraft, type SublimationDraft } from "./sublimationDraft";
import { ZERO_SUBLIMATION_CLIENT_ITEM_SETTINGS } from "@/lib/printMethods/sublimationSettings";

const stockDraft = (variantId: string, quantityStr: string): SublimationDraft => ({
  ...emptySublimationDraft(CATALOG),
  variantId,
  quantityStr,
});

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
    const d = buildSublimationLineData({ variantId: PILLOW.id, quantity: 3 }, "retail", ctx(PILLOW, { ...SETTINGS, wastePct: 10, norms: {} }));
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

describe("buildSublimationLineData — client's item (priced by print size)", () => {
  const client = (widthCm: number, heightCm: number, quantity: number) => ({
    source: "client" as const,
    clientItem: { description: " футболка клиента ", notes: " ", widthCm, heightCm },
    quantity,
  });

  it("20×30 cm ×3: area × rate, set-up fee; Epson use from the area; costs are consumables only", () => {
    const d = buildSublimationLineData(client(20, 30, 3), "retail", { item: null, settings: SETTINGS, consumableCosts: COSTS });
    expect(d.source).toBe("client");
    expect(d.item).toBeNull();
    expect(d.clientItem).toEqual({ description: "футболка клиента", notes: null, widthCm: 20, heightCm: 30 });
    expect(d.pricing).toEqual({
      tierMinQty: 1,
      priceSource: "area",
      unitPriceMdl: 120,
      totalSellPriceMdl: 390,
      areaSqmPerPiece: 0.06,
      ratePerSqmMdl: 2000,
      unitByAreaPriceMdl: 120,
      minimumApplied: false,
      unitPrintPriceMdl: 120,
      setupFeeMdl: 30,
      minimumLineUpliftMdl: 0,
    });
    // ×3 pieces × 1.1 waste: ink 0.06 × 20 × 3.3; paper 0.06 / A4 × 3.3 = 3.17 → 4 sheets; tape 0.4 m × 3.3.
    expect(d.consumption).toEqual({ paperSheets: 4, tapeM: 1.32, inkMl: 3.96 });
    expect(d.costs).toEqual({
      unitItemCostMdl: 0,
      itemCostMdl: 0,
      paperCostMdl: 8,
      tapeCostMdl: 6.6,
      inkCostMdl: 11.88,
      totalCostMdl: 26.48,
    });
    expect(d.estimatedProfitMdl).toBe(363.52);
  });

  it("dealer rate; a small print pays the per-piece minimum and the line minimum", () => {
    const ctx = { item: null, settings: SETTINGS, consumableCosts: COSTS };
    expect(buildSublimationLineData(client(20, 30, 1), "dealer", ctx).pricing.unitPriceMdl).toBe(90);
    const small = buildSublimationLineData(client(5, 5, 1), "retail", ctx);
    expect(small.pricing).toMatchObject({
      unitByAreaPriceMdl: 5,
      minimumApplied: true,
      unitPriceMdl: 50,
      setupFeeMdl: 30,
      minimumLineUpliftMdl: 70,
      totalSellPriceMdl: 150,
    });
  });

  it("throws «price not set» while both the rate and the minimum are 0", () => {
    const settings = { ...SETTINGS, clientItem: ZERO_SUBLIMATION_CLIENT_ITEM_SETTINGS };
    expect(() =>
      buildSublimationLineData(client(20, 30, 1), "retail", { item: null, settings, consumableCosts: COSTS }),
    ).toThrow("subl_price_not_set");
  });
});

describe("quoteSublimationDraft (wizard)", () => {
  it("same price as the server, incomplete while quantity is missing", () => {
    expect(quoteSublimationDraft(stockDraft(KEYCHAIN.id, "12"), "retail", CATALOG)).toMatchObject({
      ok: true,
      data: { pricing: { totalSellPriceMdl: 780 } },
    });
    expect(quoteSublimationDraft(stockDraft(KEYCHAIN.id, ""), "retail", CATALOG)).toEqual({
      ok: false,
      code: "subl_incomplete",
    });
    expect(
      quoteSublimationDraft(stockDraft("00000000-0000-4000-8000-000000000999", "1"), "retail", CATALOG),
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
