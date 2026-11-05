import { describe, expect, it } from "vitest";
import { pageCount, parseListPage } from "./listPagination";

const p = (qs: string) => parseListPage(new URLSearchParams(qs), { defaultLimit: 50, maxLimit: 100 });

describe("parseListPage", () => {
  it("defaults", () => {
    expect(p("")).toEqual({ page: 1, take: 50, skip: 0 });
  });
  it("page and limit", () => {
    expect(p("page=3&limit=30")).toEqual({ page: 3, take: 30, skip: 60 });
  });
  it("clamps the limit and ignores junk", () => {
    expect(p("limit=500").take).toBe(100);
    expect(p("limit=0").take).toBe(50);
    expect(p("limit=abc&page=-2")).toEqual({ page: 1, take: 50, skip: 0 });
    expect(p("page=x").page).toBe(1);
  });
});

describe("pageCount", () => {
  it("at least one page", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
  });
});
