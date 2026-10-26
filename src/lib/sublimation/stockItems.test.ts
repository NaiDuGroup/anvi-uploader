import { describe, expect, it } from "vitest";
import { sublimationStockItemsFromStockItems } from "./stockItems";
import type { UvStockItemRow } from "@/lib/uv/stockItems";

const row = (over: Partial<UvStockItemRow>, printMethods: string[], variants: UvStockItemRow["variants"]): UvStockItemRow => ({
  id: "i1",
  sku: "PILLOW",
  nameRo: "Pernă",
  nameRu: "Подушка",
  nameEn: "Pillow",
  sortOrder: 1,
  isActive: true,
  category: { code: "pillows", nameRo: "Perne", nameRu: "Подушки", nameEn: "Pillows", sortOrder: 30, isActive: true, printMethods },
  variants,
  ...over,
});

const variant = (id: string, over: Partial<UvStockItemRow["variants"][number]> = {}): UvStockItemRow["variants"][number] => ({
  id,
  sku: id.toUpperCase(),
  label: null,
  options: {},
  sortOrder: 0,
  isActive: true,
  stockQuantity: 0,
  avgCost: null,
  purchaseCost: null,
  sellPrice: 280,
  priceTiers: null,
  dealerPrice: null,
  ...over,
});

describe("sublimationStockItemsFromStockItems", () => {
  it("lists active variants of categories marked «sublimation» with tiers and dealer price", () => {
    const items = sublimationStockItemsFromStockItems([
      row({}, ["sublimation"], [
        variant("satin", { label: "Сатин", dealerPrice: 250, purchaseCost: 90 }),
        variant("linen", { label: "Лён", sellPrice: 320, isActive: false }),
      ]),
      row({ id: "i2" }, ["uv"], [variant("pen")]),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "satin",
      categoryCode: "pillows",
      variantLabel: "Сатин",
      priceTiers: [{ minQty: 1, priceMdl: 280 }],
      dealerPriceMdl: 250,
      unitCostMdl: 90,
    });
  });
});
