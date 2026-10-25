import { describe, expect, it } from "vitest";
import {
  applyPricesToAll,
  buildVariantSku,
  duplicateSkus,
  emptyVariantDraft,
  generateVariantGrid,
  gridAxesFromDrafts,
  mergeVariantDrafts,
  resyncVariantSkus,
  skuSegment,
  variantLabel,
  type VariantDraft,
} from "./variantGrid";

const NO_PRICES = { sellPrice: "", dealerPrice: "", purchaseCost: "", reorderLevel: "" };

describe("skuSegment", () => {
  it("transliterates Cyrillic and strips diacritics and spaces", () => {
    expect(skuSegment("Чёрный")).toBe("CHERNYY");
    expect(skuSegment("roșu deschis")).toBe("ROSUDESCHIS");
    expect(skuSegment(" 0-3 m ")).toBe("0-3M");
    expect(skuSegment("--")).toBe("");
  });
});

describe("buildVariantSku", () => {
  it("joins item SKU, colour and size in upper case", () => {
    expect(buildVariantSku("sock-01", { color: "white", size: "35-38" })).toBe("SOCK-01-WHITE-35-38");
  });

  it("skips missing parts", () => {
    expect(buildVariantSku("BODY", { size: "M" })).toBe("BODY-M");
    expect(buildVariantSku("BODY", { color: "белый" })).toBe("BODY-BELYY");
    expect(buildVariantSku("body", {})).toBe("BODY");
  });
});

describe("variantLabel", () => {
  it("formats colour / size", () => {
    expect(variantLabel({ color: "чёрный", size: "M" })).toBe("чёрный / M");
    expect(variantLabel({ size: "M" })).toBe("M");
    expect(variantLabel({})).toBe("");
  });
});

describe("generateVariantGrid", () => {
  it("builds colour × size with colours outer", () => {
    const grid = generateVariantGrid("TS", [{ name: "Black", hex: "#000000" }, { name: "White", hex: "#ffffff" }], ["S", "M"]);
    expect(grid.map((c) => c.sku)).toEqual(["TS-BLACK-S", "TS-BLACK-M", "TS-WHITE-S", "TS-WHITE-M"]);
    expect(grid[0].options).toEqual({ color: "Black", colorHex: "#000000", size: "S" });
    expect(grid[0].label).toBe("Black / S");
  });

  it("is one-dimensional with only sizes or only colours, empty with neither", () => {
    expect(generateVariantGrid("X", [], ["S", "M"]).map((c) => c.label)).toEqual(["S", "M"]);
    expect(generateVariantGrid("X", [{ name: "Red", hex: "#ff0000" }], []).map((c) => c.sku)).toEqual(["X-RED"]);
    expect(generateVariantGrid("X", [], [])).toEqual([]);
  });

  it("drops duplicate and blank axis values", () => {
    const grid = generateVariantGrid("X", [{ name: "Red", hex: "#f00000" }, { name: "red ", hex: "#000000" }], ["M", "m", " "]);
    expect(grid).toHaveLength(1);
  });
});

describe("mergeVariantDrafts", () => {
  const red = { name: "Red", hex: "#ff0000" };

  it("keeps typed values for cells that stay and adds new cells with defaults", () => {
    const first = mergeVariantDrafts([], generateVariantGrid("X", [red], ["S"]), NO_PRICES);
    const edited: VariantDraft[] = [{ ...first[0], sellPrice: "99.00" }];
    const next = mergeVariantDrafts(edited, generateVariantGrid("X", [red], ["S", "M"]), { ...NO_PRICES, sellPrice: "50.00" });
    expect(next.map((d) => [d.sku, d.sellPrice])).toEqual([
      ["X-RED-S", "99.00"],
      ["X-RED-M", "50.00"],
    ]);
  });

  it("keeps saved rows that left the grid, drops unsaved ones", () => {
    const saved: VariantDraft = { ...emptyVariantDraft("a", 0), id: "v1", sku: "X-RED-S", options: { color: "Red", size: "S" } };
    const unsaved: VariantDraft = { ...emptyVariantDraft("b", 1), sku: "X-RED-M", options: { color: "Red", size: "M" } };
    const next = mergeVariantDrafts([saved, unsaved], generateVariantGrid("X", [red], ["L"]), NO_PRICES);
    expect(next.map((d) => d.sku)).toEqual(["X-RED-L", "X-RED-S"]);
  });

  it("does not overwrite a hand-edited SKU", () => {
    const d: VariantDraft = { ...emptyVariantDraft("a", 0), sku: "CUSTOM", skuEdited: true, options: { color: "Red", size: "S" } };
    expect(mergeVariantDrafts([d], generateVariantGrid("X", [red], ["S"]), NO_PRICES)[0].sku).toBe("CUSTOM");
  });
});

describe("resyncVariantSkus / applyPricesToAll / gridAxesFromDrafts / duplicateSkus", () => {
  it("re-derives only auto SKUs of unsaved rows", () => {
    const auto: VariantDraft = { ...emptyVariantDraft("a", 0), sku: "OLD-M", options: { size: "M" } };
    const manual: VariantDraft = { ...auto, key: "b", sku: "KEEP", skuEdited: true };
    const saved: VariantDraft = { ...auto, key: "c", id: "v1", sku: "SAVED" };
    expect(resyncVariantSkus([auto, manual, saved], "new").map((d) => d.sku)).toEqual(["NEW-M", "KEEP", "SAVED"]);
  });

  it("applies only filled bulk prices", () => {
    const d: VariantDraft = { ...emptyVariantDraft("a", 0), sellPrice: "10.00", dealerPrice: "8.00" };
    const [out] = applyPricesToAll([d], { sellPrice: "12.00", dealerPrice: " " });
    expect(out.sellPrice).toBe("12.00");
    expect(out.dealerPrice).toBe("8.00");
  });

  it("recovers colours and sizes from saved variants", () => {
    const drafts: VariantDraft[] = [
      { ...emptyVariantDraft("a", 0), options: { color: "Red", colorHex: "#ff0000", size: "S" } },
      { ...emptyVariantDraft("b", 1), options: { color: "Red", colorHex: "#ff0000", size: "M" } },
    ];
    expect(gridAxesFromDrafts(drafts)).toEqual({ colors: [{ name: "Red", hex: "#ff0000" }], sizes: ["S", "M"] });
  });

  it("finds case-insensitive duplicates", () => {
    expect(duplicateSkus(["a-1", "A-1", "b", ""])).toEqual(["A-1"]);
  });
});
