import { describe, expect, it } from "vitest";
import {
  emptySublimationDraft,
  quoteSublimationDraft,
  sublimationDraftFromLineData,
  sublimationDraftToInput,
  withSublimationSource,
  type SublimationDraft,
} from "./sublimationDraft";
import { buildSublimationLineData } from "./buildSublimationLineData";
import { parseSublimationLineData } from "./parseSublimationLineData";
import { sublimationInputFromLineData } from "./sublimationInputFromLineData";
import { toSublimationPublicSummary } from "./sublimationPublicSummary";
import { CATALOG, COSTS, KEYCHAIN, PILLOW, SETTINGS } from "./sublimationTestFixtures";

const clientDraft = (patch: Partial<SublimationDraft> = {}): SublimationDraft => ({
  ...withSublimationSource(emptySublimationDraft(CATALOG), CATALOG, "client"),
  widthStr: "20",
  heightStr: "30",
  quantityStr: "3",
  ...patch,
});

describe("sublimation draft: stock / client", () => {
  it("starts as a stock line on the first blank", () => {
    expect(emptySublimationDraft(CATALOG)).toMatchObject({ source: "stock", variantId: PILLOW.id, quantityStr: "1" });
  });

  it("withSublimationSource keeps what was typed; back to stock keeps the blank or takes the first", () => {
    const d = { ...emptySublimationDraft(CATALOG), variantId: KEYCHAIN.id };
    const c = withSublimationSource(d, CATALOG, "client");
    expect(c).toMatchObject({ source: "client", variantId: KEYCHAIN.id });
    expect(withSublimationSource({ ...c, description: "кружка" }, CATALOG, "stock")).toMatchObject({
      source: "stock",
      variantId: KEYCHAIN.id,
      description: "кружка",
    });
    expect(withSublimationSource({ ...c, variantId: null }, CATALOG, "stock").variantId).toBe(PILLOW.id);
  });

  it("a client item is quoted before it is described, but saves only with a description", () => {
    const d = clientDraft();
    expect(quoteSublimationDraft(d, "retail", CATALOG)).toMatchObject({
      ok: true,
      data: { source: "client", item: null, pricing: { totalSellPriceMdl: 390 } },
    });
    expect(sublimationDraftToInput(d)).toBeNull();
    expect(sublimationDraftToInput({ ...d, description: "футболка", widthStr: "20,5" })).toEqual({
      source: "client",
      clientItem: { description: "футболка", widthCm: 20.5, heightCm: 30 },
      quantity: 3,
    });
    expect(quoteSublimationDraft({ ...d, heightStr: "" }, "retail", CATALOG)).toEqual({ ok: false, code: "subl_incomplete" });
    expect(
      quoteSublimationDraft(d, "retail", {
        ...CATALOG,
        settings: { ...SETTINGS, clientItem: { ...SETTINGS.clientItem, retailPricePerSqmMdl: 0, minimumPriceRetailMdl: 0 } },
      }),
    ).toEqual({ ok: false, code: "subl_price_not_set" });
  });

  it("client lines round-trip through the snapshot (editor and re-pricing)", () => {
    const d = clientDraft({ description: "коврик", notes: "резина" });
    const quote = quoteSublimationDraft(d, "retail", CATALOG);
    if (!quote.ok) throw new Error(quote.code);
    const stored = parseSublimationLineData(JSON.parse(JSON.stringify(quote.data)));
    expect(stored).not.toBeNull();
    expect(sublimationDraftFromLineData(stored!)).toEqual({ ...d, variantId: null });
    const input = sublimationInputFromLineData(stored);
    expect(input).toEqual({
      source: "client",
      clientItem: { description: "коврик", notes: "резина", widthCm: 20, heightCm: 30 },
      quantity: 3,
    });
    expect(buildSublimationLineData(input!, "retail", { item: null, settings: SETTINGS, consumableCosts: COSTS })).toEqual(
      quote.data,
    );
    expect(toSublimationPublicSummary(quote.data)).toEqual({
      source: "client",
      item: null,
      clientItemDescription: "коврик",
      sizeLabel: "20×30 cm",
      quantity: 3,
    });
  });

  it("stock lines round-trip too", () => {
    const d = { ...emptySublimationDraft(CATALOG), quantityStr: "2" };
    const quote = quoteSublimationDraft(d, "retail", CATALOG);
    if (!quote.ok) throw new Error(quote.code);
    expect(sublimationDraftFromLineData(quote.data)).toEqual(d);
    expect(sublimationInputFromLineData(quote.data)).toEqual({ source: "stock", variantId: PILLOW.id, quantity: 2 });
  });
});

describe("parseSublimationLineData", () => {
  it("reads old stock lines without `source` as stock", () => {
    const old = JSON.parse(
      JSON.stringify(buildSublimationLineData({ variantId: PILLOW.id, quantity: 2 }, "retail", {
        item: PILLOW,
        settings: SETTINGS,
        consumableCosts: COSTS,
      })),
    ) as Record<string, unknown>;
    delete old.source;
    delete old.clientItem;
    const parsed = parseSublimationLineData(old);
    expect(parsed?.item?.variantId).toBe(PILLOW.id);
    expect(sublimationDraftFromLineData(parsed!)).toMatchObject({ source: "stock", variantId: PILLOW.id, quantityStr: "2" });
    expect(sublimationInputFromLineData(parsed)).toEqual({ source: "stock", variantId: PILLOW.id, quantity: 2 });
  });

  it("rejects a stock line without its blank and a client line without its item", () => {
    const base = { version: 1, quantity: 1, consumption: {}, pricing: {}, costs: {} };
    expect(parseSublimationLineData({ ...base, item: null })).toBeNull();
    expect(parseSublimationLineData({ ...base, source: "client", item: null, clientItem: null })).toBeNull();
    expect(parseSublimationLineData({ ...base, source: "other", item: { variantId: "x" } })).toBeNull();
  });
});
