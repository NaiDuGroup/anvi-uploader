import { describe, expect, it } from "vitest";
import { uvItemDisplayName, uvStockItemsFromStockItems, uvVariantLabel, type UvStockItemRow } from "./stockItems";

const category = (code: string, printMethods: string[], sortOrder = 0) => ({
  code,
  nameRo: code,
  nameRu: code === "pens" ? "Ручки" : "Блокноты",
  nameEn: code,
  sortOrder,
  isActive: true,
  printMethods,
});

const variant = (id: string, over: Partial<UvStockItemRow["variants"][number]> = {}) => ({
  id,
  sku: `SKU-${id}`,
  label: null,
  options: {},
  sortOrder: 0,
  isActive: true,
  stockQuantity: "5",
  avgCost: null,
  purchaseCost: "4.04",
  sellPrice: "100",
  priceTiers: null,
  ...over,
});

const item = (id: string, cat: ReturnType<typeof category>, variants: UvStockItemRow["variants"], over: Partial<UvStockItemRow> = {}): UvStockItemRow => ({
  id,
  sku: id,
  nameRo: `Ro ${id}`,
  nameRu: `Ру ${id}`,
  nameEn: "",
  sortOrder: 0,
  isActive: true,
  category: cat,
  variants,
  ...over,
});

describe("uvStockItemsFromStockItems", () => {
  it("lists active variants of active items in UV categories, by category order", () => {
    const rows = [
      item("nb", category("notebooks", ["uv"], 2), [variant("n1", { options: { color: "Синий", size: "A5" }, priceTiers: [{ minQty: 1, priceMdl: 150 }, { minQty: 10, priceMdl: 120 }] })]),
      item("pen", category("pens", ["uv"], 1), [variant("p1"), variant("p2", { isActive: false })]),
      item("shirt", category("tshirts", ["dtf"]), [variant("s1")]),
      item("off", category("pens", ["uv"], 1), [variant("o1")], { isActive: false }),
    ];
    const out = uvStockItemsFromStockItems(rows);
    expect(out.map((i) => i.id)).toEqual(["p1", "n1"]);
    expect(out[0]).toMatchObject({
      itemId: "pen",
      categoryCode: "pens",
      sku: "SKU-p1",
      name: "Ro pen",
      variantLabel: null,
      stockQuantity: 5,
      unitCostMdl: 4.04,
      priceTiers: [{ minQty: 1, priceMdl: 100 }],
    });
    expect(out[1]).toMatchObject({ variantLabel: "Синий / A5", priceTiers: [{ minQty: 1, priceMdl: 150 }, { minQty: 10, priceMdl: 120 }] });
  });

  it("prefers avg cost and falls back to the variant label", () => {
    const [v] = uvStockItemsFromStockItems([item("pen", category("pens", ["uv"]), [variant("p", { avgCost: "3.333", label: "Gold" })])]);
    expect(v).toMatchObject({ unitCostMdl: 3.33, variantLabel: "Gold" });
    expect(uvVariantLabel({ label: "  ", options: null })).toBeNull();
  });

  it("display name uses the UI language with the variant", () => {
    const names = { ro: "Pix", ru: "Ручка", en: "" };
    expect(uvItemDisplayName({ name: "Pix", names, variantLabel: "Красный" }, "ru")).toBe("Ручка · Красный");
    expect(uvItemDisplayName({ name: "Pix", names, variantLabel: null }, "en")).toBe("Pix");
  });
});
