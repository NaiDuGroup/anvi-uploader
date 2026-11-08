import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  MATERIAL_HAS_HISTORY_ERROR,
  hasMaterialHistory,
  lfMaterialHistoryCounts,
  materialHasHistoryBody,
  sheetPaperHistoryCounts,
  visibleMaterialRows,
} from "./materialArchive";

const NO_VARIANT_USE = {
  movements: 0,
  receipts: 0,
  orderLines: 0,
  printerSlots: 0,
  designs: 0,
  importLines: 0,
};

type FakeCounts = {
  lf?: { stockVariantId: string | null; _count: Record<string, number> } | null;
  paper?: { stockVariantId: string | null; _count: Record<string, number> } | null;
  variant?: Record<string, number> | null;
  mappings?: number;
};

function fakeDb(c: FakeCounts): PrismaClient {
  return {
    largeFormatMaterial: { findUnique: async () => c.lf ?? null },
    sheetPaper: { findUnique: async () => c.paper ?? null },
    stockVariant: { findUnique: async () => (c.variant ? { _count: c.variant } : null) },
    supplierItemMapping: { count: async () => c.mappings ?? 0 },
  } as unknown as PrismaClient;
}

describe("hasMaterialHistory", () => {
  it("is false when every count is zero or there are no counts", () => {
    expect(hasMaterialHistory({})).toBe(false);
    expect(hasMaterialHistory({ orderLines: 0, receipts: 0 })).toBe(false);
  });

  it("is true when any relation has a row", () => {
    expect(hasMaterialHistory({ orderLines: 0, variantMovements: 1 })).toBe(true);
    expect(hasMaterialHistory({ sizePresets: 2 })).toBe(true);
  });
});

describe("visibleMaterialRows", () => {
  const rows = [
    { id: "a", isActive: true },
    { id: "b", isActive: false },
    { id: "c", isActive: true },
  ];

  it("hides archived rows by default", () => {
    expect(visibleMaterialRows(rows, false).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("shows archived rows when the archive toggle is on", () => {
    expect(visibleMaterialRows(rows, true).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("lfMaterialHistoryCounts", () => {
  const cleanLf = {
    stockVariantId: "v1",
    _count: { orderLines: 0, rollReceipts: 0, stockMovements: 0, sizePresets: 0 },
  };

  it("returns null for a missing roll", async () => {
    expect(await lfMaterialHistoryCounts(fakeDb({ lf: null }), "x")).toBeNull();
  });

  it("allows hard delete of a roll without any history", async () => {
    const counts = await lfMaterialHistoryCounts(fakeDb({ lf: cleanLf, variant: NO_VARIANT_USE }), "m1");
    expect(counts).not.toBeNull();
    expect(hasMaterialHistory(counts!)).toBe(false);
  });

  it.each([
    ["legacy order line", { lf: { ...cleanLf, _count: { ...cleanLf._count, orderLines: 1 } } }],
    ["legacy receipt", { lf: { ...cleanLf, _count: { ...cleanLf._count, rollReceipts: 1 } } }],
    ["legacy write-off", { lf: { ...cleanLf, _count: { ...cleanLf._count, stockMovements: 3 } } }],
    ["size preset", { lf: { ...cleanLf, _count: { ...cleanLf._count, sizePresets: 1 } } }],
    ["unified movement", { lf: cleanLf, variant: { ...NO_VARIANT_USE, movements: 1 } }],
    ["unified receipt", { lf: cleanLf, variant: { ...NO_VARIANT_USE, receipts: 1 } }],
    ["unified order line", { lf: cleanLf, variant: { ...NO_VARIANT_USE, orderLines: 1 } }],
    ["printer slot", { lf: cleanLf, variant: { ...NO_VARIANT_USE, printerSlots: 1 } }],
    ["import line", { lf: cleanLf, variant: { ...NO_VARIANT_USE, importLines: 1 } }],
    ["supplier mapping", { lf: cleanLf, variant: NO_VARIANT_USE, mappings: 1 }],
  ] as [string, FakeCounts][])("refuses hard delete with a %s", async (_label, c) => {
    const counts = await lfMaterialHistoryCounts(fakeDb({ variant: NO_VARIANT_USE, ...c }), "m1");
    expect(hasMaterialHistory(counts!)).toBe(true);
  });
});

describe("sheetPaperHistoryCounts", () => {
  const cleanPaper = {
    stockVariantId: null,
    _count: { orderLines: 0, receipts: 0, stockMovements: 0 },
  };

  it("returns null for a missing paper", async () => {
    expect(await sheetPaperHistoryCounts(fakeDb({ paper: null }), "x")).toBeNull();
  });

  it("allows hard delete of a paper without history (no stock variant)", async () => {
    const counts = await sheetPaperHistoryCounts(fakeDb({ paper: cleanPaper }), "p1");
    expect(hasMaterialHistory(counts!)).toBe(false);
  });

  it("refuses hard delete when an order line references the paper", async () => {
    const counts = await sheetPaperHistoryCounts(
      fakeDb({ paper: { ...cleanPaper, _count: { ...cleanPaper._count, orderLines: 2 } } }),
      "p1",
    );
    expect(hasMaterialHistory(counts!)).toBe(true);
  });

  it("refuses hard delete when the paper's stock variant has movements", async () => {
    const counts = await sheetPaperHistoryCounts(
      fakeDb({ paper: { ...cleanPaper, stockVariantId: "v2" }, variant: { ...NO_VARIANT_USE, movements: 5 } }),
      "p1",
    );
    expect(hasMaterialHistory(counts!)).toBe(true);
  });
});

describe("materialHasHistoryBody", () => {
  it("carries the error code the admin page maps to the archive advice", () => {
    expect(materialHasHistoryBody("lf").error).toBe(MATERIAL_HAS_HISTORY_ERROR);
    expect(materialHasHistoryBody("paper").message).toMatch(/архив/);
  });
});
