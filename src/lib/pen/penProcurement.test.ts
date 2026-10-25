import { describe, expect, it } from "vitest";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import { mapLegacyPenProcurementItems, penProcurementLabel } from "./penProcurement";

describe("mapLegacyPenProcurementItems", () => {
  const mug: OrderProcurementMetaItem = {
    kind: "mug",
    productId: "m1",
    sku: "MUG",
    requestedQty: 1,
    stockAtOrder: 0,
  };

  it("rewrites a legacy pen entry as a stock_variant entry", () => {
    const out = mapLegacyPenProcurementItems(
      [{ kind: "pen", productId: "old-pen", sku: "ARDENES_RED", requestedQty: 5, stockAtOrder: 2 }],
      new Map([["old-pen", "v-red"]]),
    );
    expect(out).toEqual([
      {
        kind: "stock_variant",
        variantId: "v-red",
        label: "Ручка ARDENES_RED",
        requestedQty: 5,
        stockAtOrder: 2,
      },
    ]);
  });

  it("keeps other kinds and unknown pens untouched", () => {
    const unknownPen: OrderProcurementMetaItem = {
      kind: "pen",
      productId: "gone",
      requestedQty: 1,
      stockAtOrder: 0,
    };
    expect(mapLegacyPenProcurementItems([mug, unknownPen], new Map())).toEqual([mug, unknownPen]);
  });
});

describe("penProcurementLabel", () => {
  it("names the pen with its sku", () => {
    expect(penProcurementLabel({ nameRu: "Ручка Ardenes красная", sku: "ARDENES_RED" })).toBe(
      "Ручка Ardenes красная (ARDENES_RED)",
    );
  });

  it("works without a snapshot", () => {
    expect(penProcurementLabel(null)).toBe("Ручка");
  });
});
