import { describe, expect, it } from "vitest";
import {
  NOTEBOOK_BATCH_ELIGIBLE_STATUS,
  filterTilesReadyForBatch,
  flattenNotebookSectionTiles,
  orderIdsToPromote,
  splitNotebookTilesIntoBatches,
  type NotebookBatchTileFromSection,
} from "./notebookBatchFromSection";
import type {
  WorkshopBoardFile,
  WorkshopBoardGroup,
  WorkshopBoardLine,
  WorkshopBoardSection,
} from "./types";

/** Minimal valid-shape file for the pure helpers. */
function file(partial: Partial<WorkshopBoardFile> = {}): WorkshopBoardFile {
  return {
    id: partial.id ?? "file-1",
    fileName: partial.fileName ?? "default.png",
    fileUrl: partial.fileUrl ?? "https://cdn/example.png",
    copies: partial.copies ?? 1,
    color: partial.color ?? "",
    paperType: partial.paperType ?? null,
    pageCount: partial.pageCount ?? null,
    orderLineId: partial.orderLineId ?? null,
  };
}

/** Minimal valid-shape line (only the fields our helpers read). */
function line(partial: {
  orderId: string;
  orderLineId?: string;
  orderNumber: number;
  status?: string;
  files: WorkshopBoardFile[];
}): WorkshopBoardLine {
  return {
    uid: `${partial.orderId}::${partial.orderLineId ?? "line-1"}`,
    orderId: partial.orderId,
    orderLineId: partial.orderLineId ?? "line-1",
    orderNumber: partial.orderNumber,
    lineIndex: 1,
    totalLines: 1,
    phone: "079999999",
    clientName: null,
    status: partial.status ?? NOTEBOOK_BATCH_ELIGIBLE_STATUS,
    isPrio: false,
    unreadCommentCount: 0,
    commentCount: 0,
    createdAt: "2026-10-02T12:00:00Z",
    productType: "notebook",
    facts: {
      kind: "notebook",
      data: {
        sku: "NB-A5",
        displayName: "Notebook A5",
        imageUrl: null,
        coverColorHex: null,
        paperKind: null,
        quantity: 1,
      },
    },
    files: partial.files,
    notes: null,
    createdByName: null,
    sentToWorkshopByName: null,
  };
}

function group(key: string, lines: WorkshopBoardLine[]): WorkshopBoardGroup {
  const totalQty = lines.reduce((s, l) => s + l.files.length, 0);
  return {
    key,
    label: key,
    aggregate: {
      lineCount: lines.length,
      orderCount: new Set(lines.map((l) => l.orderId)).size,
      totalQty,
    },
    lines,
    meta: {},
  };
}

function section(groups: WorkshopBoardGroup[]): WorkshopBoardSection {
  const lineCount = groups.reduce((s, g) => s + g.lines.length, 0);
  const totalQty = groups.reduce((s, g) => s + g.aggregate.totalQty, 0);
  const orderCount = new Set(
    groups.flatMap((g) => g.lines.map((l) => l.orderId)),
  ).size;
  return {
    productType: "notebook",
    groups,
    totals: { lineCount, orderCount, totalQty },
  };
}

describe("flattenNotebookSectionTiles", () => {
  it("walks groups → lines → files in UI order and expands copies", () => {
    const sec = section([
      group("green", [
        line({
          orderId: "ord-1",
          orderNumber: 8228,
          files: [file({ id: "f1", fileName: "8228-verde-A5.png", copies: 2 })],
        }),
      ]),
      group("blue", [
        line({
          orderId: "ord-2",
          orderNumber: 8231,
          files: [file({ id: "f2", fileName: "8231-albastru.png" })],
        }),
      ]),
    ]);

    const tiles = flattenNotebookSectionTiles(sec);
    expect(tiles).toHaveLength(3);
    // copies = 2 → two tiles for order 8228
    expect(tiles[0]).toMatchObject({ orderId: "ord-1", orderNumber: 8228 });
    expect(tiles[1]).toMatchObject({ orderId: "ord-1", orderNumber: 8228 });
    expect(tiles[2]).toMatchObject({ orderId: "ord-2", orderNumber: 8231 });
  });

  it("overrides parser orderNumber with the authoritative line.orderNumber", () => {
    const sec = section([
      group("green", [
        line({
          orderId: "ord-1",
          orderNumber: 9999, // authoritative
          // file name doesn't start with the right digits — parser would say null.
          files: [file({ fileName: "cover_verde.png" })],
        }),
      ]),
    ]);
    const tiles = flattenNotebookSectionTiles(sec);
    expect(tiles[0]!.parsed.orderNumber).toBe(9999);
    expect(tiles[0]!.parsed.color.slug).toBe("verde");
  });

  it("defaults missing/invalid copies to 1", () => {
    const sec = section([
      group("x", [
        line({
          orderId: "ord-1",
          orderNumber: 1,
          files: [
            file({ fileName: "a.png", copies: 0 }), // → 1
            file({ fileName: "b.png", copies: -5 }), // → 1
            file({ fileName: "c.png", copies: 2.9 }), // → floor = 2
          ],
        }),
      ]),
    ]);
    const tiles = flattenNotebookSectionTiles(sec);
    expect(tiles).toHaveLength(1 + 1 + 2);
  });

  it("empty section → empty list", () => {
    expect(flattenNotebookSectionTiles(section([]))).toEqual([]);
  });
});

describe("filterTilesReadyForBatch (idempotency boundary)", () => {
  function tile(
    orderId: string,
    orderNumber: number,
  ): NotebookBatchTileFromSection {
    return {
      orderId,
      orderNumber,
      orderLineId: `${orderId}-line`,
      file: file({ fileName: `${orderNumber}.png` }),
      parsed: {
        orderNumber,
        baseName: `${orderNumber}`,
        color: {
          slug: "unknown",
          hex: "#777",
          label: { ro: "?", ru: "?", en: "?" },
        },
      },
    };
  }

  it("keeps only tiles whose order is in SENT_TO_WORKSHOP", () => {
    const tiles = [tile("a", 1), tile("b", 2), tile("c", 3), tile("d", 4)];
    const status = new Map<string, string>([
      ["a", NOTEBOOK_BATCH_ELIGIBLE_STATUS],
      ["b", "WORKSHOP_PRINTING"],
      ["c", NOTEBOOK_BATCH_ELIGIBLE_STATUS],
      ["d", "WORKSHOP_READY"],
    ]);
    const fresh = filterTilesReadyForBatch(tiles, status);
    expect(fresh.map((t) => t.orderId)).toEqual(["a", "c"]);
  });

  it("all stale → empty output", () => {
    const tiles = [tile("a", 1), tile("b", 2)];
    const status = new Map<string, string>([
      ["a", "WORKSHOP_PRINTING"],
      ["b", "WORKSHOP_READY"],
    ]);
    expect(filterTilesReadyForBatch(tiles, status)).toEqual([]);
  });

  it("missing status in snapshot → tile dropped (defensive)", () => {
    const tiles = [tile("a", 1)];
    expect(filterTilesReadyForBatch(tiles, new Map())).toEqual([]);
  });
});

describe("orderIdsToPromote", () => {
  function tile(orderId: string): NotebookBatchTileFromSection {
    return {
      orderId,
      orderNumber: 1,
      orderLineId: "l",
      file: file(),
      parsed: {
        orderNumber: 1,
        baseName: "x",
        color: {
          slug: "unknown",
          hex: "#777",
          label: { ro: "?", ru: "?", en: "?" },
        },
      },
    };
  }

  it("dedupes and preserves first-appearance order", () => {
    expect(
      orderIdsToPromote([tile("a"), tile("b"), tile("a"), tile("c"), tile("b")]),
    ).toEqual(["a", "b", "c"]);
  });

  it("empty input → empty output", () => {
    expect(orderIdsToPromote([])).toEqual([]);
  });
});

describe("splitNotebookTilesIntoBatches (max=8)", () => {
  const MAX = 8;
  const seq = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

  it("8 → [[8]]", () => {
    expect(splitNotebookTilesIntoBatches(seq(8), MAX)).toEqual([seq(8)]);
  });

  it("9 → [[7], [2]] (steal one so last batch is 2, not 1)", () => {
    const out = splitNotebookTilesIntoBatches(seq(9), MAX);
    expect(out.map((b) => b.length)).toEqual([7, 2]);
    // flattened preserves order (just not the exact split point)
    expect(out.flat()).toEqual(seq(9));
  });

  it("17 → [[8], [7], [2]]", () => {
    const out = splitNotebookTilesIntoBatches(seq(17), MAX);
    expect(out.map((b) => b.length)).toEqual([8, 7, 2]);
    expect(out.flat()).toEqual(seq(17));
  });

  it("25 → [[8], [8], [7], [2]]", () => {
    const out = splitNotebookTilesIntoBatches(seq(25), MAX);
    expect(out.map((b) => b.length)).toEqual([8, 8, 7, 2]);
    expect(out.flat()).toEqual(seq(25));
  });

  it("2 → [[2]] (no fix-up needed)", () => {
    expect(splitNotebookTilesIntoBatches(seq(2), MAX)).toEqual([seq(2)]);
  });

  it("1 → [[1]] (caller must gate on length >= 2; helper stays total)", () => {
    expect(splitNotebookTilesIntoBatches(seq(1), MAX)).toEqual([[1]]);
  });

  it("0 → []", () => {
    expect(splitNotebookTilesIntoBatches([], MAX)).toEqual([]);
  });

  it("16 → [[8], [8]] (clean split, no fix-up)", () => {
    const out = splitNotebookTilesIntoBatches(seq(16), MAX);
    expect(out.map((b) => b.length)).toEqual([8, 8]);
  });

  it("throws on invalid max", () => {
    expect(() => splitNotebookTilesIntoBatches([1, 2], 1)).toThrow(/max/);
    expect(() => splitNotebookTilesIntoBatches([1, 2], 0)).toThrow(/max/);
    expect(() => splitNotebookTilesIntoBatches([1, 2], 2.5)).toThrow(/max/);
  });
});
