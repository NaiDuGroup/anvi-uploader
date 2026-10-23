import { describe, expect, it } from "vitest";
import {
  computeLineProductPurchaseTotal,
  EMPTY_LIVE_UNIT_COSTS,
  type ProfitOrderLineInput,
} from "@/lib/accounting/orderProfit";
import {
  dtfDraftFromLineData,
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
      mugProductId: null,
      mugProductSnapshot: null,
      notebookProductId: null,
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
