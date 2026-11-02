import { describe, expect, it } from "vitest";
import { buildUvLineData } from "./buildUvLineData";
import { parseUvLineData } from "./parseUvLineData";
import { emptyUvStickersDraft, quoteUvDraft, uvDraftFromLineData, uvDraftToInput, withUvItem, withUvTechnique } from "./uvDraft";
import { uvInputFromLineData } from "./uvInputFromLineData";
import { uvLineInputSchema, type UvLineInput } from "./uvLineInput";
import { UvLineErrorCode } from "./uvLineCalc";
import { CATALOG, INK_COSTS, PEN } from "./uvTestFixtures";

/** UV-DTF films A + B at 9.90 lei/m each (INPRINT OtterPro 32 cm × 100 m, 990 lei a roll). */
const COSTS = { ...INK_COSTS, uvDtfFilmPerMeterMdl: 19.8 };
const ctx = { item: null, settings: CATALOG.settings, inkCosts: COSTS };

function stickers(widthCm: number, heightCm: number, quantity: number): UvLineInput {
  return uvLineInputSchema.parse({
    source: "stickers",
    technique: "transfer",
    quantity,
    zones: [{ id: "z1", placement: "front", widthCm, heightCm, whiteLayers: 2, varnish: true }],
  });
}

describe("UV-DTF stickers", () => {
  it("sells an A3 sheet by the metre: 0.42 m × 500 = 210 retail, × 240 = 100 dealer", () => {
    const retail = buildUvLineData(stickers(30, 42, 1), "retail", ctx);
    expect(retail.technique).toBe("transfer");
    expect(retail.pricing.transferMeters).toBeCloseTo(0.42, 3);
    expect(retail.pricing.totalSellPriceMdl).toBe(210);
    const dealer = buildUvLineData(stickers(30, 42, 1), "dealer", ctx);
    expect(dealer.pricing.totalSellPriceMdl).toBe(100);
  });

  it("raises a small order to the UV-DTF minimum (100 retail, 50 dealer)", () => {
    expect(buildUvLineData(stickers(5, 5, 1), "retail", ctx).pricing.totalSellPriceMdl).toBe(100);
    expect(buildUvLineData(stickers(5, 5, 1), "dealer", ctx).pricing.totalSellPriceMdl).toBe(50);
  });

  it("costs film A + B per metre and ink with two white layers and varnish", () => {
    const d = buildUvLineData(stickers(30, 100, 1), "retail", ctx);
    expect(d.pricing.totalSellPriceMdl).toBe(500);
    expect(d.consumption.filmMeters).toBeCloseTo(1, 3);
    expect(d.costs.filmCostMdl).toBeCloseTo(19.8, 2);
    expect(d.zones[0]).toMatchObject({ whiteLayers: 2, varnish: true, primer: false, unitPrintPriceMdl: 0 });
    expect(d.consumption.whiteMl).toBeGreaterThan(d.consumption.cmykMl);
    expect(d.consumption.varnishMl).toBeGreaterThan(0);
    expect(d.costs.totalCostMdl).toBeCloseTo(
      d.costs.filmCostMdl! + d.costs.cmykInkCostMdl + d.costs.whiteInkCostMdl + d.costs.varnishCostMdl,
      2,
    );
  });

  it("lays many stickers out on the film width", () => {
    const d = buildUvLineData(stickers(10, 10, 20), "retail", ctx);
    // Two 10 cm stickers fit across 30 cm with the gap: 10 rows ≈ 1.05 m.
    expect(d.pricing.transferMeters!).toBeGreaterThan(1);
    expect(d.pricing.transferMeters!).toBeLessThan(1.1);
  });

  it("refuses a sticker wider than the film", () => {
    expect(() => buildUvLineData(stickers(35, 35, 1), "retail", ctx)).toThrowError(UvLineErrorCode.ZoneWiderThanFilm);
  });

  it("keeps the stock item price for a UV-DTF item (print included) and counts the film in the cost", () => {
    const input = uvLineInputSchema.parse({
      source: "stock",
      technique: "transfer",
      variantId: PEN.id,
      quantity: 2,
      zones: [{ id: "z1", placement: "front", whiteLayers: 2, varnish: true }],
    });
    const d = buildUvLineData(input, "retail", { ...ctx, item: PEN });
    expect(d.pricing.totalSellPriceMdl).toBe(200);
    expect(d.pricing.transferMeters).toBe(0);
    expect(d.consumption.filmMeters!).toBeGreaterThan(0);
    expect(d.costs.filmCostMdl!).toBeGreaterThan(0);
  });

  it("refuses stickers without UV-DTF", () => {
    const r = uvLineInputSchema.safeParse({
      source: "stickers",
      technique: "direct",
      quantity: 1,
      zones: [{ id: "z1", placement: "front", widthCm: 5, heightCm: 5 }],
    });
    expect(r.success).toBe(false);
  });
});

describe("UV-DTF draft", () => {
  it("starts stickers with two white layers and varnish, and round-trips through a saved line", () => {
    const draft = { ...emptyUvStickersDraft(), zones: emptyUvStickersDraft().zones.map((z) => ({ ...z, widthStr: "30", heightStr: "42" })) };
    expect(draft.zones[0]).toMatchObject({ whiteLayers: 2, varnish: true, primer: false });
    const input = uvDraftToInput(draft);
    expect(input).toMatchObject({ source: "stickers", technique: "transfer" });
    const q = quoteUvDraft(draft, "retail", { ...CATALOG, inkCosts: COSTS });
    if (!q.ok) throw new Error(q.code);
    expect(q.data.pricing.totalSellPriceMdl).toBe(210);
    const saved = parseUvLineData(JSON.parse(JSON.stringify(q.data)));
    expect(saved?.source).toBe("stickers");
    expect(uvInputFromLineData(saved)).toMatchObject({ source: "stickers", technique: "transfer" });
    expect(uvDraftFromLineData(saved!)).toMatchObject({ source: "stickers", technique: "transfer" });
  });

  it("switches a direct line to UV-DTF and back", () => {
    const direct = withUvItem(emptyUvStickersDraft(), CATALOG, "client", null);
    const back = withUvTechnique({ ...direct, technique: "transfer" }, "direct");
    expect(back.zones[0]).toMatchObject({ whiteLayers: 1, varnish: false });
    const again = withUvTechnique(back, "transfer");
    expect(again.zones[0]).toMatchObject({ whiteLayers: 2, varnish: true, primer: false });
  });

  it("picks UV-DTF for an item marked as UV-DTF (mugs without sublimation)", () => {
    const mug = { ...PEN, id: "mug-1", printNorms: { ...PEN.printNorms, transfer: true } };
    const cat = { ...CATALOG, items: [PEN, mug] };
    const d = withUvItem(withUvItem(emptyUvStickersDraft(), cat, "client", null), cat, "stock", "mug-1");
    expect(d.technique).toBe("transfer");
    expect(d.zones[0]).toMatchObject({ whiteLayers: 2, varnish: true });
    const pen = withUvItem(d, cat, "stock", PEN.id);
    expect(pen.technique ?? "direct").toBe("direct");
  });
});
