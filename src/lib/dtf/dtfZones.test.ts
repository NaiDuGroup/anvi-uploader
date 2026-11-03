import { describe, expect, it } from "vitest";
import { DTF_PLACEMENTS } from "./dtfConstants";
import type { DtfPresetOption } from "./dtfLineCalc";
import { dtfZoneInputSchema } from "./dtfLineInput";
import {
  DTF_ZONE_SHAPES,
  dtfPlacementAvailable,
  inferGarmentSilhouette,
  nextDtfPlacement,
  silhouetteForKind,
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

describe("garment silhouettes", () => {
  it("blocks the placket zones on polos only", () => {
    expect(dtfPlacementAvailable("chest_center", "polo")).toBe(false);
    expect(dtfPlacementAvailable("chest_across", "polo")).toBe(false);
    expect(dtfPlacementAvailable("chest_left", "polo")).toBe(true);
    expect(dtfPlacementAvailable("front_mid", "polo")).toBe(true);
    for (const p of DTF_PLACEMENTS) expect(dtfPlacementAvailable(p, "tshirt")).toBe(true);
  });

  it("tells the outline from the stock item, not for client garments", () => {
    expect(inferGarmentSilhouette("stock", "polo", "apparel")).toBe("polo");
    expect(inferGarmentSilhouette("stock", "tshirt", "tshirts")).toBe("tshirt");
    // Known non-T-shirt families keep the T-shirt outline without a switch.
    expect(inferGarmentSilhouette("stock", "cap", "caps")).toBe("tshirt");
    expect(inferGarmentSilhouette("stock", "hoodie")).toBe("tshirt");
    expect(inferGarmentSilhouette("stock", "other", "bags")).toBe("tshirt");
    expect(inferGarmentSilhouette("stock", "other", "polos")).toBe("polo");
    // Mixed or unknown categories: the operator switches.
    expect(inferGarmentSilhouette("stock", "other", "apparel")).toBeNull();
    expect(inferGarmentSilhouette("stock", "other")).toBeNull();
    expect(inferGarmentSilhouette("stock", undefined, "tshirts")).toBeNull();
    expect(inferGarmentSilhouette("client", null)).toBeNull();
    expect(inferGarmentSilhouette("client", "polo")).toBeNull();
    expect(silhouetteForKind("polo")).toBe("polo");
    expect(silhouetteForKind(null)).toBe("tshirt");
  });

  it("draws the wearer's left chest and sleeve on the viewer's right", () => {
    expect(DTF_ZONE_SHAPES.chest_left.x).toBeGreaterThan(50);
    expect(DTF_ZONE_SHAPES.chest_right.x + DTF_ZONE_SHAPES.chest_right.w).toBeLessThan(50);
    expect(DTF_ZONE_SHAPES.sleeve_left.x).toBeGreaterThan(50);
  });
});

describe("nextDtfPlacement", () => {
  it("adds the back after a front print, then a clear chest / sleeve spot", () => {
    expect(nextDtfPlacement([], "tshirt")).toBe("front_mid");
    expect(nextDtfPlacement(["front_mid"], "tshirt")).toBe("back");
    expect(nextDtfPlacement(["front_mid", "back"], "tshirt")).toBe("sleeve_left");
    expect(nextDtfPlacement(["chest_left"], "tshirt")).toBe("back");
    expect(nextDtfPlacement(["front", "back"], "tshirt")).toBe("sleeve_left");
  });

  it("skips zones the polo has no room for and falls back to «other»", () => {
    const allButPlacket = DTF_PLACEMENTS.filter(
      (p) => p !== "chest_center" && p !== "chest_across" && p !== "other",
    );
    expect(nextDtfPlacement(allButPlacket, "polo")).toBe("other");
    expect(nextDtfPlacement(allButPlacket, "tshirt")).toBe("chest_center");
  });
});

describe("zone validation", () => {
  it("accepts the new zones and the old keys of saved lines", () => {
    for (const placement of ["nape", "chest_across", "front", "chest_left"]) {
      expect(dtfZoneInputSchema.safeParse({ id: "z1", placement, presetId: null }).success).toBe(true);
    }
    expect(dtfZoneInputSchema.safeParse({ id: "z1", placement: "pocket", presetId: null }).success).toBe(false);
  });
});
