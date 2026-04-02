import { describe, it, expect } from "vitest";
import {
  normalizeOrderPageLimit,
  DEFAULT_ORDER_PAGE_SIZE,
  ORDER_PAGE_SIZE_OPTIONS,
} from "./orderPagination";

describe("normalizeOrderPageLimit", () => {
  it("returns default for undefined/null/empty", () => {
    expect(normalizeOrderPageLimit(undefined)).toBe(DEFAULT_ORDER_PAGE_SIZE);
    expect(normalizeOrderPageLimit(null)).toBe(DEFAULT_ORDER_PAGE_SIZE);
    expect(normalizeOrderPageLimit("")).toBe(DEFAULT_ORDER_PAGE_SIZE);
  });

  it("accepts each valid page size option", () => {
    for (const size of ORDER_PAGE_SIZE_OPTIONS) {
      expect(normalizeOrderPageLimit(size)).toBe(size);
    }
  });

  it("accepts valid sizes passed as strings", () => {
    expect(normalizeOrderPageLimit("15")).toBe(15);
    expect(normalizeOrderPageLimit("30")).toBe(30);
    expect(normalizeOrderPageLimit("100")).toBe(100);
  });

  it("returns default for invalid numbers", () => {
    expect(normalizeOrderPageLimit(7)).toBe(DEFAULT_ORDER_PAGE_SIZE);
    expect(normalizeOrderPageLimit(25)).toBe(DEFAULT_ORDER_PAGE_SIZE);
    expect(normalizeOrderPageLimit(0)).toBe(DEFAULT_ORDER_PAGE_SIZE);
    expect(normalizeOrderPageLimit(-1)).toBe(DEFAULT_ORDER_PAGE_SIZE);
  });

  it("returns default for NaN and Infinity", () => {
    expect(normalizeOrderPageLimit(NaN)).toBe(DEFAULT_ORDER_PAGE_SIZE);
    expect(normalizeOrderPageLimit(Infinity)).toBe(DEFAULT_ORDER_PAGE_SIZE);
    expect(normalizeOrderPageLimit("abc")).toBe(DEFAULT_ORDER_PAGE_SIZE);
  });
});
