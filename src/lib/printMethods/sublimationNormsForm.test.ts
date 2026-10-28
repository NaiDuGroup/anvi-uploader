import { describe, expect, it } from "vitest";
import {
  parseSublimationClientItemDraft,
  parseSublimationNormsDraft,
  sublimationClientItemDraft,
  sublimationNormsDraft,
} from "./sublimationNormsForm";
import { ZERO_SUBLIMATION_CLIENT_ITEM_SETTINGS } from "./sublimationSettings";

describe("sublimation norms table", () => {
  const settings = { wastePct: 5, norms: { mugs: { paperSheets: 1, tapeCm: 30, inkMl: 1.5 }, old: { paperSheets: 9, tapeCm: 9, inkMl: 9 } },
    clientItem: ZERO_SUBLIMATION_CLIENT_ITEM_SETTINGS,
  };

  it("one row per listed category; missing norms start at 0", () => {
    expect(sublimationNormsDraft(settings, ["mugs", "pillows"])).toEqual({
      wastePct: "5",
      norms: {
        mugs: { paperSheets: "1", tapeCm: "30", inkMl: "1.5" },
        pillows: { paperSheets: "0", tapeCm: "0", inkMl: "0" },
      },
    });
  });

  it("parses decimal commas, empty cells as 0, and sends only the listed categories", () => {
    const res = parseSublimationNormsDraft({
      wastePct: "7,5",
      norms: {
        mugs: { paperSheets: "1", tapeCm: "", inkMl: "0,8" },
        keychains: { paperSheets: "0.25", tapeCm: "5", inkMl: "0.1" },
      },
    });
    expect(res).toEqual({
      ok: true,
      patch: {
        wastePct: 7.5,
        norms: {
          mugs: { paperSheets: 1, tapeCm: 0, inkMl: 0.8 },
          keychains: { paperSheets: 0.25, tapeCm: 5, inkMl: 0.1 },
        },
      },
    });
  });

  it("points at the first invalid cell", () => {
    expect(parseSublimationNormsDraft({ wastePct: "150", norms: {} })).toEqual({ ok: false, field: "wastePct" });
    expect(
      parseSublimationNormsDraft({ wastePct: "0", norms: { clocks: { paperSheets: "1", tapeCm: "-3", inkMl: "x" } } }),
    ).toEqual({ ok: false, field: { categoryCode: "clocks", key: "tapeCm" } });
  });

  it("client-item block: one string per key, empty = 0, invalid field reported", () => {
    const draft = sublimationClientItemDraft(settings);
    expect(draft.retailPricePerSqmMdl).toBe("0");
    expect(parseSublimationClientItemDraft({ ...draft, retailPricePerSqmMdl: "1800", setupFeeMdl: "" })).toEqual({
      ok: true,
      clientItem: { ...ZERO_SUBLIMATION_CLIENT_ITEM_SETTINGS, retailPricePerSqmMdl: 1800 },
    });
    expect(parseSublimationClientItemDraft({ ...draft, tapeCmPerPiece: "-1" })).toEqual({ ok: false, field: "tapeCmPerPiece" });
  });
});
