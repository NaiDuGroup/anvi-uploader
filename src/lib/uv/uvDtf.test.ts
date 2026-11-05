import { describe, expect, it } from "vitest";
import { buildUvLineData } from "./buildUvLineData";
import { parseUvLineData } from "./parseUvLineData";
import { emptyUvStickersDraft, quoteUvDraft, uvDraftFromLineData, uvDraftToInput, withUvItem, withUvTechnique } from "./uvDraft";
import { uvInputFromLineData } from "./uvInputFromLineData";
import { uvLineInputSchema, type UvLineInput } from "./uvLineInput";
import { UvLineErrorCode, uvDtfExtraWhiteLayers } from "./uvLineCalc";
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

  describe("white layers above the two in the price (+15% of the film each)", () => {
    const ctx15 = { ...ctx, settings: { ...CATALOG.settings, whiteLayerSurchargePct: 15 } };
    function a3(whiteLayers: number, quantity = 1): UvLineInput {
      return uvLineInputSchema.parse({
        source: "stickers",
        technique: "transfer",
        quantity,
        zones: [{ id: "z1", placement: "as_is", widthCm: 30, heightCm: 42, whiteLayers, varnish: true }],
      });
    }

    it("A3 retail: 2 layers 210, 3 layers 240 (241.5 → 5), 4 layers 275 (273 → 5)", () => {
      const two = buildUvLineData(a3(2), "retail", ctx15);
      expect(two.pricing.totalSellPriceMdl).toBe(210);
      expect(two.pricing.whiteSurchargeTotalMdl).toBe(0);
      const three = buildUvLineData(a3(3), "retail", ctx15);
      expect(three.pricing.transferSellTotalMdl).toBe(210);
      expect(three.pricing.whiteSurchargeTotalMdl).toBe(30);
      expect(three.pricing.totalSellPriceMdl).toBe(240);
      const four = buildUvLineData(a3(4), "retail", ctx15);
      expect(four.pricing.whiteSurchargeTotalMdl).toBe(65);
      expect(four.pricing.totalSellPriceMdl).toBe(275);
    });

    it("dealer: 0.42 m × 240 = 100.8 → 100; 3 layers 115.92 → 115", () => {
      expect(buildUvLineData(a3(2), "dealer", ctx15).pricing.totalSellPriceMdl).toBe(100);
      expect(buildUvLineData(a3(3), "dealer", ctx15).pricing.totalSellPriceMdl).toBe(115);
    });

    it("0 or 1 layer is accepted and costs the base price, with less white ink", () => {
      for (const layers of [0, 1]) {
        const input = a3(layers);
        expect(input.zones[0]!.whiteLayers).toBe(layers);
        const d = buildUvLineData(input, "retail", ctx15);
        expect(d.zones[0]!.whiteLayers).toBe(layers);
        expect(d.pricing.totalSellPriceMdl).toBe(210);
        expect(d.pricing.whiteSurchargeTotalMdl).toBe(0);
      }
      const none = buildUvLineData(a3(0), "retail", ctx15);
      const two = buildUvLineData(a3(2), "retail", ctx15);
      const four = buildUvLineData(a3(4), "retail", ctx15);
      expect(none.consumption.whiteMl).toBe(0);
      expect(four.consumption.whiteMl).toBeCloseTo(two.consumption.whiteMl * 2, 2);
      expect(four.costs.whiteInkCostMdl).toBeGreaterThan(two.costs.whiteInkCostMdl);
    });

    it("the minimum still applies after the surcharge", () => {
      const small = (layers: number) =>
        uvLineInputSchema.parse({
          source: "stickers",
          technique: "transfer",
          quantity: 1,
          zones: [{ id: "z1", placement: "as_is", widthCm: 5, heightCm: 5, whiteLayers: layers, varnish: true }],
        });
      expect(buildUvLineData(small(4), "retail", ctx15).pricing.totalSellPriceMdl).toBe(100);
    });

    it("weights extra layers by sticker area across zones", () => {
      expect(
        uvDtfExtraWhiteLayers([
          { widthCm: 10, heightCm: 10, whiteLayers: 4 },
          { widthCm: 10, heightCm: 30, whiteLayers: 2 },
        ]),
      ).toBeCloseTo(0.5, 6);
      expect(uvDtfExtraWhiteLayers([{ widthCm: 10, heightCm: 10, whiteLayers: 1 }])).toBe(0);
    });

    it("leaves a stock UV-DTF item price alone (main print included)", () => {
      const input = uvLineInputSchema.parse({
        source: "stock",
        technique: "transfer",
        variantId: PEN.id,
        quantity: 2,
        zones: [{ id: "z1", placement: "front", whiteLayers: 4, varnish: true }],
      });
      const d = buildUvLineData(input, "retail", { ...ctx15, item: PEN });
      expect(d.pricing.whiteSurchargeTotalMdl).toBe(0);
      expect(d.pricing.totalSellPriceMdl).toBe(200);
    });
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

describe("UV-DTF on the workshop board", () => {
  it("lists every sticker with its artwork for the UV-DTF film", async () => {
    const { groupLines } = await import("@/lib/workshopBoard/groupLines");
    const { collectUvDtfFilmTransfers, hasUvDtfLines } = await import("@/lib/dtf/dtfFilmLayout");
    const { uvZoneFilePaperType } = await import("./uvConstants");
    const data = buildUvLineData(stickers(6, 4, 5), "retail", ctx);
    const lineId = "o1-line";
    const order = {
      id: "o1",
      orderNumber: 9100,
      phone: "+37300000000",
      clientName: null,
      status: "SENT_TO_WORKSHOP",
      isPrio: false,
      unreadCommentCount: 0,
      commentCount: 0,
      createdAt: "2026-11-02T00:00:00.000Z",
      notes: null,
      orderLines: [
        {
          id: lineId,
          sortOrder: 0,
          productType: "uv_print",
          mugProductSnapshot: null,
          notebookProductSnapshot: null,
          penProductSnapshot: null,
          largeFormatLineData: null,
          uvLineData: JSON.parse(JSON.stringify(data)) as unknown,
          files: [],
        },
      ],
      files: [
        {
          id: "f1",
          fileName: "logo.png",
          fileUrl: "/logo.png",
          copies: 5,
          color: "color",
          paperType: uvZoneFilePaperType("z1"),
          pageCount: null,
          orderLineId: lineId,
        },
      ],
      productType: "uv_print",
      createdByName: null,
      sentToWorkshopByName: null,
    };
    const [section] = groupLines([order as Parameters<typeof groupLines>[0][number]]);
    const lines = section!.groups.flatMap((g) => g.lines);
    expect(hasUvDtfLines(lines)).toBe(true);
    const film = collectUvDtfFilmTransfers(lines);
    expect(film.transfers).toHaveLength(5);
    expect(film.transfers.every((t) => t.fileId === "f1" && t.widthCm === 6 && t.heightCm === 4)).toBe(true);
    expect(film.orderNumbers).toEqual([9100]);
  });
});
