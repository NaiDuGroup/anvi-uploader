import { describe, it, expect } from "vitest";
import type { OrderProcurementMetaItem } from "./orderProcurement";
import {
  procurementMetaToList,
  skuFromMugSnapshot,
  skuFromNotebookSnapshot,
} from "./orderProcurement";

describe("procurementMetaToList", () => {
  it("returns empty for null and undefined", () => {
    expect(procurementMetaToList(null)).toEqual([]);
    expect(procurementMetaToList(undefined)).toEqual([]);
  });

  it("normalizes single object", () => {
    const m: OrderProcurementMetaItem = {
      kind: "mug",
      productId: "a",
      requestedQty: 2,
      stockAtOrder: 0,
    };
    expect(procurementMetaToList(m)).toEqual([m]);
  });

  it("filters valid entries in array", () => {
    const good: OrderProcurementMetaItem = {
      kind: "notebook",
      productId: "b",
      requestedQty: 1,
      stockAtOrder: 0,
    };
    const list = procurementMetaToList([
      good,
      null,
      { kind: "invalid" },
      { foo: 1 },
    ]);
    expect(list).toEqual([good]);
  });

  it("returns empty for unknown object shape", () => {
    expect(procurementMetaToList({ foo: 1 })).toEqual([]);
    expect(procurementMetaToList({ kind: "other" })).toEqual([]);
  });
});

describe("skuFromMugSnapshot / skuFromNotebookSnapshot", () => {
  it("reads string sku", () => {
    expect(skuFromMugSnapshot({ sku: "M1" })).toBe("M1");
    expect(skuFromNotebookSnapshot({ sku: "N1" })).toBe("N1");
  });

  it("returns undefined when missing or wrong type", () => {
    expect(skuFromMugSnapshot({})).toBeUndefined();
    expect(skuFromMugSnapshot({ sku: 1 })).toBeUndefined();
    expect(skuFromNotebookSnapshot(null)).toBeUndefined();
  });
});
