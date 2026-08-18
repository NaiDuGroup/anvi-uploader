import { describe, expect, it } from "vitest";
import { EMPTY_CLIENT_DEBT, mergeClientOrderAggregates } from "./clientDebt";

describe("mergeClientOrderAggregates", () => {
  it("merges totals and unpaid rows per client", () => {
    const map = mergeClientOrderAggregates(
      [
        { clientId: "a", count: 5 },
        { clientId: "b", count: 2 },
      ],
      [{ clientId: "a", count: 3, sumMdl: 1250.5 }],
    );
    expect(map.get("a")).toEqual({
      ordersCount: 5,
      unpaidCount: 3,
      unpaidTotalMdl: 1250.5,
    });
    expect(map.get("b")).toEqual({
      ordersCount: 2,
      unpaidCount: 0,
      unpaidTotalMdl: 0,
    });
  });

  it("treats a null unpaid sum (only priceless unpaid orders) as zero debt", () => {
    const map = mergeClientOrderAggregates(
      [{ clientId: "a", count: 1 }],
      [{ clientId: "a", count: 1, sumMdl: null }],
    );
    expect(map.get("a")).toEqual({
      ordersCount: 1,
      unpaidCount: 1,
      unpaidTotalMdl: 0,
    });
  });

  it("ignores rows for orders not linked to a registry client", () => {
    const map = mergeClientOrderAggregates(
      [{ clientId: null, count: 10 }],
      [{ clientId: null, count: 4, sumMdl: 99 }],
    );
    expect(map.size).toBe(0);
  });

  it("keeps an unpaid-only client even if the totals row is missing", () => {
    const map = mergeClientOrderAggregates(
      [],
      [{ clientId: "x", count: 2, sumMdl: 100 }],
    );
    expect(map.get("x")).toEqual({
      ordersCount: 0,
      unpaidCount: 2,
      unpaidTotalMdl: 100,
    });
  });

  it("rounds unpaid totals to bani", () => {
    const map = mergeClientOrderAggregates(
      [{ clientId: "a", count: 3 }],
      [{ clientId: "a", count: 3, sumMdl: 0.1 + 0.2 }],
    );
    expect(map.get("a")?.unpaidTotalMdl).toBe(0.3);
  });

  it("exposes an all-zero default shape", () => {
    expect(EMPTY_CLIENT_DEBT).toEqual({
      ordersCount: 0,
      unpaidCount: 0,
      unpaidTotalMdl: 0,
    });
  });
});