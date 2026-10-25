import { describe, expect, it } from "vitest";
import {
  defaultTierDrafts,
  draftsToTiers,
  garmentKindForCategoryCode,
  isWhiteColor,
  sameTiers,
  singlePiecePrice,
  tierColorKey,
  tierGroupsFromVariants,
  tiersByColor,
  tiersToDrafts,
} from "./garmentTiers";

describe("tiers ↔ editor rows", () => {
  it("round-trips sorted tiers without trailing zeros", () => {
    const drafts = tiersToDrafts([
      { minQty: 10, priceMdl: 240 },
      { minQty: 1, priceMdl: 280.5 },
    ]);
    expect(drafts).toEqual([
      { minQty: "1", priceMdl: "280.5" },
      { minQty: "10", priceMdl: "240" },
    ]);
    expect(draftsToTiers(drafts)).toEqual({
      ok: true,
      tiers: [
        { minQty: 1, priceMdl: 280.5 },
        { minQty: 10, priceMdl: 240 },
      ],
    });
  });

  it("ignores blank rows and clears when nothing is left", () => {
    expect(draftsToTiers([])).toEqual({ ok: true, tiers: null });
    expect(draftsToTiers([{ minQty: " ", priceMdl: "" }])).toEqual({ ok: true, tiers: null });
    expect(draftsToTiers([{ minQty: "1", priceMdl: "70" }, { minQty: "", priceMdl: "" }])).toEqual({
      ok: true,
      tiers: [{ minQty: 1, priceMdl: 70 }],
    });
  });

  it("sorts rows typed out of order and accepts a comma decimal", () => {
    expect(draftsToTiers([{ minQty: "50", priceMdl: "200" }, { minQty: "1", priceMdl: "280,5" }])).toEqual({
      ok: true,
      tiers: [
        { minQty: 1, priceMdl: 280.5 },
        { minQty: 50, priceMdl: 200 },
      ],
    });
  });

  it("reports half-filled, duplicate, missing «от 1» and too many rows", () => {
    expect(draftsToTiers([{ minQty: "1", priceMdl: "" }])).toEqual({ ok: false, error: "invalid" });
    expect(draftsToTiers([{ minQty: "0", priceMdl: "10" }])).toEqual({ ok: false, error: "invalid" });
    expect(draftsToTiers([{ minQty: "1", priceMdl: "abc" }])).toEqual({ ok: false, error: "invalid" });
    expect(
      draftsToTiers([
        { minQty: "1", priceMdl: "10" },
        { minQty: "1", priceMdl: "9" },
      ]),
    ).toEqual({ ok: false, error: "duplicate_qty" });
    expect(draftsToTiers([{ minQty: "2", priceMdl: "10" }])).toEqual({ ok: false, error: "need_single_piece" });
    const eleven = Array.from({ length: 11 }, (_, i) => ({ minQty: String(i + 1), priceMdl: "10" }));
    expect(draftsToTiers(eleven)).toEqual({ ok: false, error: "too_many" });
  });

  it("reads the 1-piece price and compares tier lists", () => {
    expect(singlePiecePrice([{ minQty: 2, priceMdl: 5 }, { minQty: 1, priceMdl: 7 }])).toBe(7);
    expect(singlePiecePrice(null)).toBeNull();
    expect(sameTiers([{ minQty: 1, priceMdl: 7 }], [{ minQty: 1, priceMdl: 7 }])).toBe(true);
    expect(sameTiers(null, [])).toBe(true);
    expect(sameTiers([{ minQty: 1, priceMdl: 7 }], [{ minQty: 1, priceMdl: 8 }])).toBe(false);
  });
});

describe("isWhiteColor", () => {
  it("recognises white by name in ru / ro / en", () => {
    for (const name of ["Белый", "белая", "white", "Off White", "alb", "Albă"]) {
      expect(isWhiteColor(name, "#1f2937")).toBe(true);
    }
  });

  it("does not match words that merely contain the letters", () => {
    expect(isWhiteColor("Голубой", "#60a5fa")).toBe(false);
    expect(isWhiteColor("albastru", "#1d4ed8")).toBe(false);
    expect(isWhiteColor("whitesmoke-ish", "#333333")).toBe(false);
  });

  it("falls back to a near-white swatch", () => {
    expect(isWhiteColor("молочный", "#FFFFF0")).toBe(true);
    expect(isWhiteColor("серый", "#e5e7eb")).toBe(false);
    expect(isWhiteColor(null, "#ffffff")).toBe(true);
    expect(isWhiteColor(undefined, "nope")).toBe(false);
  });
});

describe("price-list defaults", () => {
  it("maps category codes to price-list families", () => {
    expect(garmentKindForCategoryCode("tshirts")).toBe("tshirt");
    expect(garmentKindForCategoryCode("socks")).toBe("socks");
    expect(garmentKindForCategoryCode("bodysuits")).toBe("bodysuit");
    expect(garmentKindForCategoryCode("mystery")).toBe("other");
  });

  it("picks white vs coloured t-shirt prices", () => {
    expect(defaultTierDrafts("tshirts", { name: "Белый", hex: "#ffffff" })[0]).toEqual({ minQty: "1", priceMdl: "280" });
    expect(defaultTierDrafts("tshirts", { name: "Чёрный", hex: "#000000" })[0]).toEqual({ minQty: "1", priceMdl: "350" });
    expect(defaultTierDrafts("socks", {}).map((d) => d.minQty)).toEqual(["1", "2", "10", "50"]);
  });
});

describe("colour groups", () => {
  const variants = [
    { options: { color: "Белый", colorHex: "#ffffff", size: "S" }, priceTiers: null },
    { options: { color: "белый", colorHex: "#ffffff", size: "M" }, priceTiers: [{ minQty: 1, priceMdl: 280 }] },
    { options: { color: "Чёрный", colorHex: "#000000", size: "S" }, priceTiers: null },
    { options: { size: "L" }, priceTiers: null },
  ];

  it("groups by colour case-insensitively, colourless rows together", () => {
    expect(tierColorKey({ color: " Белый ", size: "S" })).toBe("белый");
    expect(tierColorKey({ size: "S" })).toBe("");
    expect(tierGroupsFromVariants(variants)).toEqual([
      { key: "белый", color: "Белый", hex: "#ffffff" },
      { key: "чёрный", color: "Чёрный", hex: "#000000" },
      { key: "", color: null, hex: undefined },
    ]);
  });

  it("takes the first saved tiers of each colour", () => {
    const map = tiersByColor(variants);
    expect([...map.keys()]).toEqual(["белый"]);
    expect(map.get("белый")).toEqual([{ minQty: 1, priceMdl: 280 }]);
  });
});
