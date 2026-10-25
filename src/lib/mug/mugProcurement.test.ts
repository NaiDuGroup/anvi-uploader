import { describe, expect, it } from "vitest";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import { mapLegacyMugProcurementItems, mugProcurementLabel } from "./mugProcurement";

describe("mapLegacyMugProcurementItems", () => {
  it("rewrites a legacy mug entry (waiting order from before the switch) as a stock_variant entry", () => {
    const out = mapLegacyMugProcurementItems(
      [{ kind: "mug", productId: "old-mug", sku: "MUG-WHITE-330", requestedQty: 6, stockAtOrder: 1 }],
      new Map([["old-mug", "v-white"]]),
    );
    expect(out).toEqual([
      { kind: "stock_variant", variantId: "v-white", label: "Кружка MUG-WHITE-330", requestedQty: 6, stockAtOrder: 1 },
    ]);
  });

  it("keeps other kinds and unknown mugs untouched", () => {
    const notebook: OrderProcurementMetaItem = {
      kind: "notebook",
      productId: "old-mug",
      requestedQty: 1,
      stockAtOrder: 0,
    };
    const unknownMug: OrderProcurementMetaItem = { kind: "mug", productId: "gone", requestedQty: 2, stockAtOrder: 0 };
    expect(mapLegacyMugProcurementItems([notebook, unknownMug], new Map([["old-mug", "v1"]]))).toEqual([
      notebook,
      unknownMug,
    ]);
  });

  it("labels an entry without sku with the bare product name", () => {
    const out = mapLegacyMugProcurementItems(
      [{ kind: "mug", productId: "old-mug", requestedQty: 1, stockAtOrder: 0 }],
      new Map([["old-mug", "v1"]]),
    );
    expect(out[0]).toMatchObject({ kind: "stock_variant", label: "Кружка" });
  });
});

describe("mugProcurementLabel", () => {
  it("names the mug with its sku", () => {
    expect(mugProcurementLabel({ nameRu: "Кружка белая", sku: "MUG-W" })).toBe("Кружка белая (MUG-W)");
    expect(mugProcurementLabel({ nameRu: "Кружка белая", sku: "—" })).toBe("Кружка белая");
    expect(mugProcurementLabel(null)).toBe("Кружка");
  });
});
