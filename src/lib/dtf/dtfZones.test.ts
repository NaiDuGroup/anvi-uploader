import { describe, expect, it } from "vitest";
import { DTF_PLACEMENTS } from "./dtfConstants";
import type { DtfPresetOption } from "./dtfLineCalc";
import { dtfZoneInputSchema } from "./dtfLineInput";
import {
  DTF_ZONE_SHAPES,
  dtfGarmentTakesShirtZones,
  dtfZoneLabel,
  nextDtfPlacement,
  suggestDtfPresetForPlacement,
} from "./dtfZones";

const preset = (id: string, widthCm: number, heightCm: number): DtfPresetOption => ({
  id,
  label: id,
  widthCm,
  heightCm,
  retailPrice: 100,
  dealerPrice: null,
});

/** Studio price list as seeded (Logo, A6, A5, A4, A3). */
const PRICE_LIST = [
  preset("logo", 10, 10),
  preset("a6", 10, 15),
  preset("a5", 15, 21),
  preset("a4", 21, 30),
  preset("a3", 30, 42),
];

const suggest = (p: Parameters<typeof suggestDtfPresetForPlacement>[0], list = PRICE_LIST) =>
  suggestDtfPresetForPlacement(p, list)?.id ?? null;

describe("suggestDtfPresetForPlacement", () => {
  it("maps zones to the studio formats by size", () => {
    expect(suggest("front")).toBe("a3");
    expect(suggest("back")).toBe("a3");
    expect(suggest("front_mid")).toBe("a4");
    expect(suggest("back_mid")).toBe("a4");
    expect(suggest("chest_left")).toBe("logo");
    expect(suggest("chest_right")).toBe("logo");
    expect(suggest("chest_center")).toBe("logo");
    expect(suggest("sleeve_left")).toBe("logo");
    expect(suggest("sleeve_right")).toBe("logo");
    expect(suggest("nape")).toBe("logo");
  });

  it("leaves the format alone when nothing is close", () => {
    expect(suggest("chest_across")).toBeNull();
    expect(suggest("other")).toBeNull();
    expect(suggest("front", [])).toBeNull();
    // A cap's list without the logo: no A3 near a chest logo.
    expect(suggest("chest_left", [preset("a3", 30, 42)])).toBeNull();
  });

  it("takes the nearest format when the usual one is missing", () => {
    const noA3 = PRICE_LIST.filter((p) => p.id !== "a3");
    expect(suggest("front", noA3)).toBe("a4");
    const noLogo = PRICE_LIST.filter((p) => p.id !== "logo");
    expect(suggest("chest_left", noLogo)).toBe("a6");
  });

  it("matches a wide strip format for the across-chest zone, either orientation", () => {
    expect(suggest("chest_across", [...PRICE_LIST, preset("strip", 8, 30)])).toBe("strip");
  });
});

describe("garment shape", () => {
  it("gives T-shirt zones to tops, client garments and unknown kinds", () => {
    expect(dtfGarmentTakesShirtZones(undefined)).toBe(true);
    expect(dtfGarmentTakesShirtZones({ kind: "tshirt", categoryCode: "tshirts" })).toBe(true);
    expect(dtfGarmentTakesShirtZones({ kind: "polo", categoryCode: "apparel" })).toBe(true);
    expect(dtfGarmentTakesShirtZones({ kind: "hoodie" })).toBe(true);
    expect(dtfGarmentTakesShirtZones({ kind: "bodysuit", categoryCode: "bodysuits" })).toBe(true);
    expect(dtfGarmentTakesShirtZones({ kind: "other", categoryCode: "apparel" })).toBe(true);
  });

  it("sends caps, socks, bags and underwear to «other»", () => {
    expect(dtfGarmentTakesShirtZones({ kind: "cap", categoryCode: "caps" })).toBe(false);
    expect(dtfGarmentTakesShirtZones({ kind: "socks", categoryCode: "socks" })).toBe(false);
    expect(dtfGarmentTakesShirtZones({ kind: "other", categoryCode: "bags" })).toBe(false);
    expect(dtfGarmentTakesShirtZones({ kind: "other", categoryCode: "underwear" })).toBe(false);
  });

  it("draws the wearer's left chest and sleeve on the viewer's right", () => {
    expect(DTF_ZONE_SHAPES.chest_left.x).toBeGreaterThan(50);
    expect(DTF_ZONE_SHAPES.chest_right.x + DTF_ZONE_SHAPES.chest_right.w).toBeLessThan(50);
    expect(DTF_ZONE_SHAPES.sleeve_left.x).toBeGreaterThan(50);
  });
});

describe("nextDtfPlacement", () => {
  it("adds the back after a front print, then a clear chest / sleeve spot", () => {
    expect(nextDtfPlacement([])).toBe("front_mid");
    expect(nextDtfPlacement(["front_mid"])).toBe("back");
    expect(nextDtfPlacement(["front_mid", "back"])).toBe("sleeve_left");
    expect(nextDtfPlacement(["chest_left"])).toBe("back");
    expect(nextDtfPlacement(["front", "back"])).toBe("sleeve_left");
  });

  it("falls back to «other» when every zone is used", () => {
    const allButOther = DTF_PLACEMENTS.filter((p) => p !== "other");
    expect(nextDtfPlacement(allButOther)).toBe("other");
    expect(nextDtfPlacement(allButOther.filter((p) => p !== "nape"))).toBe("nape");
  });
});

describe("zone validation", () => {
  it("accepts the new zones and the old keys of saved lines", () => {
    for (const placement of ["nape", "chest_across", "front", "chest_left"]) {
      expect(dtfZoneInputSchema.safeParse({ id: "z1", placement, presetId: null }).success).toBe(true);
    }
    expect(dtfZoneInputSchema.safeParse({ id: "z1", placement: "pocket", presetId: null }).success).toBe(false);
  });

  it("takes a short trimmed note for the place", () => {
    const ok = dtfZoneInputSchema.safeParse({ id: "z1", placement: "other", placementNote: "  левая штанина ", presetId: null });
    expect(ok.success && ok.data.placementNote).toBe("левая штанина");
    const long = dtfZoneInputSchema.safeParse({ id: "z1", placement: "other", placementNote: "x".repeat(81), presetId: null });
    expect(long.success).toBe(false);
  });
});

describe("dtfZoneLabel", () => {
  const names = { other: "Другое место", front_mid: "Средний перед" } as Record<(typeof DTF_PLACEMENTS)[number], string>;
  it("shows the note of an «other» zone, the zone name otherwise", () => {
    expect(dtfZoneLabel({ placement: "other", placementNote: "левая штанина" }, names)).toBe("Другое место: левая штанина");
    expect(dtfZoneLabel({ placement: "other", placementNote: "  " }, names)).toBe("Другое место");
    expect(dtfZoneLabel({ placement: "other" }, names)).toBe("Другое место");
    expect(dtfZoneLabel({ placement: "front_mid", placementNote: "stale" }, names)).toBe("Средний перед");
  });
});
