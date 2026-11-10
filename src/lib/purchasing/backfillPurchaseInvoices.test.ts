import { describe, it, expect } from "vitest";
import { backfillCutoff, quarterChunks } from "./backfillPurchaseInvoices";

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("quarterChunks", () => {
  it("splits a range on calendar quarters", () => {
    const chunks = quarterChunks(utc("2023-02-15"), utc("2023-10-10"));
    expect(chunks.map((c) => [c.from.toISOString().slice(0, 10), c.to.toISOString().slice(0, 10)])).toEqual([
      ["2023-02-15", "2023-04-01"],
      ["2023-04-01", "2023-07-01"],
      ["2023-07-01", "2023-10-01"],
      ["2023-10-01", "2023-10-10"],
    ]);
  });

  it("covers three years in 12 calls", () => {
    expect(quarterChunks(utc("2023-01-01"), utc("2026-01-01"))).toHaveLength(12);
  });
});

describe("backfillCutoff", () => {
  const now = utc("2026-11-10");
  it("never reaches into the normal 45-day sync window", () => {
    expect(backfillCutoff(now, utc("2026-11-01")).toISOString().slice(0, 10)).toBe("2026-09-26");
    expect(backfillCutoff(now, null).toISOString().slice(0, 10)).toBe("2026-09-26");
  });
  it("keeps an earlier requested end", () => {
    expect(backfillCutoff(now, utc("2025-01-01")).toISOString().slice(0, 10)).toBe("2025-01-01");
  });
});
