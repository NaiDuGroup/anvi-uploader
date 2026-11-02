import { describe, expect, it } from "vitest";
import {
  computeLineProductPurchaseTotal,
  EMPTY_LIVE_UNIT_COSTS,
  type ProfitOrderLineInput,
} from "@/lib/accounting/orderProfit";
import {
  dtfDraftFromLineData,
  dtfDraftLayoutRuns,
  dtfDraftToInput,
  dtfDraftTotalPieces,
  emptyDtfDraft,
  quoteDtfDraft,
  withDtfGarment,
  type DtfDraft,
} from "./dtfDraft";
import { A4, A5, CATALOG, withQuantities } from "./dtfTestFixtures";

describe("dtfDraft", () => {
  it("starts on the first stock garment with the A4 print", () => {
    const draft = emptyDtfDraft(CATALOG);
    expect(draft.garmentSource).toBe("stock");
    expect(draft.sizes.map((s) => s.size)).toEqual(["S", "M", "L"]);
    expect(draft.zones[0]?.presetId).toBe(A4);
    expect(dtfDraftToInput(draft)).toBeNull();
  });

  it("prices one white shirt with an A4 print at 280 (order #4665)", () => {
    const quote = quoteDtfDraft(withQuantities(emptyDtfDraft(CATALOG), { M: 1 }), "retail", CATALOG);
    expect(quote.ok && quote.data.pricing.totalSellPriceMdl).toBe(280);
  });

  it("applies the 10+ tier across sizes: 12 shirts = 2880 (order #8628)", () => {
    const draft = withQuantities(emptyDtfDraft(CATALOG), { S: 4, M: 5, L: 3 });
    expect(dtfDraftTotalPieces(draft)).toBe(12);
    const quote = quoteDtfDraft(draft, "retail", CATALOG);
    expect(quote.ok && quote.data.pricing.totalSellPriceMdl).toBe(2880);
    expect(quote.ok && quote.data.pricing.tierMinQty).toBe(10);
  });

  it("charges an extra back zone at the transfer rate", () => {
    const base = withQuantities(emptyDtfDraft(CATALOG), { M: 1 });
    const draft: DtfDraft = {
      ...base,
      zones: [...base.zones, { id: "back", placement: "back", presetId: A5, widthStr: "", heightStr: "" }],
    };
    const quote = quoteDtfDraft(draft, "retail", CATALOG);
    expect(quote.ok && quote.data.pricing.totalSellPriceMdl).toBe(420);
  });

  it("prices a client garment by transfer size only (A4 = 180, order #520)", () => {
    const draft = withDtfGarment(emptyDtfDraft(CATALOG), CATALOG, "client", null);
    expect(draft.sizes).toEqual([{ size: "—", quantityStr: "1" }]);
    const quote = quoteDtfDraft(draft, "retail", CATALOG);
    expect(quote.ok && quote.data.pricing.totalSellPriceMdl).toBe(180);
  });

  it("reports a missing custom size as incomplete", () => {
    const base = withQuantities(emptyDtfDraft(CATALOG), { M: 1 });
    const draft: DtfDraft = {
      ...base,
      zones: [{ ...base.zones[0]!, presetId: null, widthStr: "12", heightStr: "" }],
    };
    expect(quoteDtfDraft(draft, "retail", CATALOG)).toEqual({ ok: false, code: "dtf_incomplete" });
  });

  it("round-trips a saved line back into the editor", () => {
    const draft = withQuantities(emptyDtfDraft(CATALOG), { S: 2, L: 1 });
    const quote = quoteDtfDraft(draft, "retail", CATALOG);
    if (!quote.ok) throw new Error(quote.code);
    const restored = dtfDraftFromLineData(quote.data, CATALOG);
    expect(restored.sizes).toEqual([
      { size: "S", quantityStr: "2" },
      { size: "M", quantityStr: "" },
      { size: "L", quantityStr: "1" },
    ]);
    expect(restored.zones[0]?.presetId).toBe(A4);
  });

  it("feeds its frozen costs into order profit COGS", () => {
    const quote = quoteDtfDraft(withQuantities(emptyDtfDraft(CATALOG), { M: 2 }), "retail", CATALOG);
    if (!quote.ok) throw new Error(quote.code);
    const line: ProfitOrderLineInput = {
      productType: "dtf_apparel",
      mugProductSnapshot: null,
      notebookProductSnapshot: null,
      largeFormatLineData: null,
      dtfLineData: JSON.parse(JSON.stringify(quote.data)) as unknown,
      files: [{ copies: 2 }],
    };
    expect(computeLineProductPurchaseTotal(line, EMPTY_LIVE_UNIT_COSTS)).toEqual({
      lineTotal: Math.round(quote.data.costs.totalCostMdl),
      missingUnitCost: false,
    });
    expect(
      computeLineProductPurchaseTotal({ ...line, dtfLineData: null }, EMPTY_LIVE_UNIT_COSTS),
    ).toEqual({ lineTotal: 0, missingUnitCost: true });
  });
});

describe("dtfDraft price list 2026-11", () => {
  const dealerShirt = {
    ...CATALOG,
    garments: CATALOG.garments.map((g) => ({
      ...g,
      variants: g.variants.map((v) => ({ ...v, dealerPriceMdl: 100 })),
    })),
  };

  it("sells the t-shirt 100 + A4 180 = 280; an A5 instead = 100 + 140", () => {
    const a4 = quoteDtfDraft(withQuantities(emptyDtfDraft(CATALOG), { M: 1 }), "retail", CATALOG);
    expect(a4.ok && a4.data.pricing.totalSellPriceMdl).toBe(280);
    const draft = withQuantities(emptyDtfDraft(CATALOG), { M: 1 });
    draft.zones = draft.zones.map((z) => ({ ...z, presetId: A5 }));
    const a5 = quoteDtfDraft(draft, "retail", CATALOG);
    expect(a5.ok && [a5.data.zones[0]?.unitPrintPriceMdl, a5.data.pricing.totalSellPriceMdl]).toEqual([140, 240]);
  });

  it("charges a dealer the fixed t-shirt price plus the dealer A4, at any run", () => {
    const one = quoteDtfDraft(withQuantities(emptyDtfDraft(dealerShirt), { M: 1 }), "dealer", dealerShirt);
    expect(one.ok && one.data.pricing.totalSellPriceMdl).toBe(180);
    const run = quoteDtfDraft(withQuantities(emptyDtfDraft(dealerShirt), { S: 20, M: 20, L: 20 }), "dealer", dealerShirt);
    expect(run.ok && run.data.sizes[0]?.unitSellPriceMdl).toBe(100);
  });

  it("includes a logo in a cap's price and charges the difference for a bigger print", () => {
    const cap = {
      ...CATALOG,
      garments: CATALOG.garments.map((g) => ({ ...g, kind: "cap" as const, includedPrint: { widthCm: 10, heightCm: 10 } })),
    };
    const quote = quoteDtfDraft(withQuantities(emptyDtfDraft(cap), { M: 1 }), "retail", cap);
    expect(quote.ok && quote.data.zones[0]).toMatchObject({ unitIncludedCreditMdl: 100, unitPrintPriceMdl: 80 });
  });

  it("round-trips «no press» through the draft", () => {
    const draft: DtfDraft = {
      ...withDtfGarment(emptyDtfDraft(CATALOG), CATALOG, "client", null),
    };
    draft.zones = draft.zones.map((z) => ({ ...z, noPress: true }));
    expect(dtfDraftToInput(draft)?.zones[0]?.noPress).toBe(true);
    // The fixture A4 has no no-press price, so the quote refuses it.
    expect(quoteDtfDraft(draft, "dealer", CATALOG)).toEqual({ ok: false, code: "dtf_no_press_unavailable" });
  });
});

describe("dtfDraft same layout across lines", () => {
  it("prices two lines of one layout by their pieces together", () => {
    const white = { ...withQuantities(emptyDtfDraft(CATALOG), { M: 5 }), layoutKey: "k1" };
    const other = { ...withQuantities(emptyDtfDraft(CATALOG), { L: 5 }), layoutKey: "k1" };
    const runs = dtfDraftLayoutRuns([white, other, null]);
    expect(runs.get("k1")).toBe(10);
    const alone = quoteDtfDraft(white, "retail", CATALOG);
    expect(alone.ok && alone.data.pricing.totalSellPriceMdl).toBe(1300);
    const pooled = quoteDtfDraft({ ...white, layoutRunQuantity: runs.get("k1") }, "retail", CATALOG);
    expect(pooled.ok && pooled.data.pricing.totalSellPriceMdl).toBe(1200);
    expect(pooled.ok && pooled.data.pricing.tierMinQty).toBe(10);
    expect(pooled.ok && pooled.data.runQuantity).toBe(10);
    expect(pooled.ok && pooled.data.quantity).toBe(5);
  });

  it("keeps the layout key through the input and a saved line", () => {
    const draft = { ...withQuantities(emptyDtfDraft(CATALOG), { M: 2 }), layoutKey: "k9" };
    expect(dtfDraftToInput(draft)?.layoutKey).toBe("k9");
    const quote = quoteDtfDraft(draft, "retail", CATALOG);
    if (!quote.ok) throw new Error(quote.code);
    expect(quote.data.layoutKey).toBe("k9");
    expect(quote.data.runQuantity).toBeUndefined();
    expect(dtfDraftFromLineData(quote.data, CATALOG).layoutKey).toBe("k9");
  });
});
