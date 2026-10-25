import { describe, expect, it } from "vitest";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import { mapLegacyNotebookProcurementItems, notebookProcurementLabel } from "./notebookProcurement";

describe("mapLegacyNotebookProcurementItems", () => {
  const mug: OrderProcurementMetaItem = {
    kind: "mug",
    productId: "m1",
    sku: "MUG",
    requestedQty: 1,
    stockAtOrder: 0,
  };

  it("rewrites a legacy notebook entry as a stock_variant entry", () => {
    const out = mapLegacyNotebookProcurementItems(
      [{ kind: "notebook", productId: "old-nb", sku: "S3-KBL-A5", requestedQty: 5, stockAtOrder: 2 }],
      new Map([["old-nb", "v-red"]]),
    );
    expect(out).toEqual([
      {
        kind: "stock_variant",
        variantId: "v-red",
        label: "Блокнот S3-KBL-A5",
        requestedQty: 5,
        stockAtOrder: 2,
      },
    ]);
  });

  it("keeps other kinds (incl. legacy pens) and unknown notebooks untouched", () => {
    const pen: OrderProcurementMetaItem = {
      kind: "pen",
      productId: "old-nb",
      requestedQty: 1,
      stockAtOrder: 0,
    };
    const unknownNotebook: OrderProcurementMetaItem = {
      kind: "notebook",
      productId: "gone",
      requestedQty: 1,
      stockAtOrder: 0,
    };
    expect(
      mapLegacyNotebookProcurementItems([mug, pen, unknownNotebook], new Map([["old-nb", "v-red"]])),
    ).toEqual([mug, pen, unknownNotebook]);
  });
});

describe("notebookProcurementLabel", () => {
  it("names the notebook with its sku", () => {
    expect(notebookProcurementLabel({ nameRu: "Блокнот A5 красный", sku: "S3-KBL-A5" })).toBe(
      "Блокнот A5 красный (S3-KBL-A5)",
    );
  });

  it("works without a snapshot", () => {
    expect(notebookProcurementLabel(null)).toBe("Блокнот");
  });
});
