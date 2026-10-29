import { describe, expect, it } from "vitest";
import {
  adjustPrice,
  buildCsv,
  countsFromCsv,
  markupPercent,
  parseCsv,
  stockBulkPriceSchema,
  stocktakeTarget,
} from "./bulkEdit";

describe("stocktakeTarget", () => {
  it("sets the counted quantity when nothing moved meanwhile", () => {
    expect(stocktakeTarget(10, 7, 10)).toBe(7);
  });
  it("keeps sales made after the count", () => {
    // counted 7 while the book said 10; 2 sold since then (book now 8) → 5 on the shelf
    expect(stocktakeTarget(8, 7, 10)).toBe(5);
  });
  it("never goes below zero", () => {
    expect(stocktakeTarget(0, 0, 3)).toBe(0);
  });
  it("rounds fractional units", () => {
    expect(stocktakeTarget(12.3456, 10.1, 12.3456)).toBe(10.1);
  });
});

describe("prices", () => {
  it("markup over cost", () => {
    expect(markupPercent(150, 100)).toBe(50);
    expect(markupPercent(150, null)).toBeNull();
    expect(markupPercent(null, 100)).toBeNull();
  });
  it("percent change rounds to whole lei or a step", () => {
    expect(adjustPrice(99, 10)).toBe(109);
    expect(adjustPrice(99, 10, 5)).toBe(110);
    expect(adjustPrice(100, -100)).toBe(0);
  });
  it("rejects an update with no fields", () => {
    const id = "6f1c2b8e-1f1a-4c1d-9a3e-0a0b0c0d0e0f";
    expect(stockBulkPriceSchema.safeParse({ updates: [{ variantId: id }] }).success).toBe(false);
    expect(stockBulkPriceSchema.safeParse({ updates: [{ variantId: id, dealerPrice: null }] }).success).toBe(true);
  });
});

describe("csv", () => {
  it("round-trips quotes, separators and Cyrillic", () => {
    const text = buildCsv([
      ["Артикул", "Название", "Факт"],
      ["MUG-1", 'Кружка "белая"; 330', 5],
    ]);
    expect(text.startsWith("﻿")).toBe(true);
    expect(parseCsv(text)).toEqual([
      ["Артикул", "Название", "Факт"],
      ["MUG-1", 'Кружка "белая"; 330', "5"],
    ]);
  });
  it("reads comma-separated files and finds the columns by header", () => {
    const rows = parseCsv("SKU,Name,Counted\nA-1,x,3\nA-2,y,\n");
    const counts = countsFromCsv(rows, { sku: ["артикул", "sku"], counted: ["факт", "counted"] });
    expect(counts).toEqual(new Map([["A-1", "3"]]));
  });
  it("returns null when the columns are missing", () => {
    expect(countsFromCsv([["a", "b"]], { sku: ["sku"], counted: ["counted"] })).toBeNull();
  });
});
