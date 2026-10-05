import { describe, expect, it } from "vitest";
import { MUG_SHEET_SLOTS } from "@/lib/mug/composeMugSheetPng";
import {
  MUG_BATCH_ELIGIBLE_STATUS,
  filterMugTilesReadyForBatch,
  flattenMugSectionTiles,
  mugOrderIdsToPromote,
  splitMugTilesIntoSheets,
  type MugBatchTileFromSection,
} from "./mugBatchFromSection";
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
    fileName: partial.fileName ?? "cana.png",
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
    status: partial.status ?? MUG_BATCH_ELIGIBLE_STATUS,
    isPrio: false,
    unreadCommentCount: 0,
    commentCount: 0,
    createdAt: "2026-10-02T12:00:00Z",
    productType: "mug",
    facts: {
      kind: "mug",
      data: {
        sku: "CANA-ALB",
        displayName: "Кружка белая",
        imageUrl: null,
        bodyColorHex: null,
        handleColorHex: null,
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
    productType: "mug",
    groups,
    totals: { lineCount, orderCount, totalQty },
  };
}

function tile(
  orderId: string,
  orderNumber: number,
): MugBatchTileFromSection {
  return { orderId, orderNumber, orderLineId: "line-1", file: file() };
}

describe("flattenMugSectionTiles", () => {
  it("walks groups → lines → files in UI order and expands copies", () => {
    const sec = section([
      group("CANA-ALB", [
        line({
          orderId: "ord-1",
          orderNumber: 8228,
          files: [file({ id: "f1", copies: 2 })],
        }),
      ]),
      group("CANA-NEAGRA", [
        line({
          orderId: "ord-2",
          orderNumber: 8231,
          files: [file({ id: "f2" })],
        }),
      ]),
    ]);

    const tiles = flattenMugSectionTiles(sec);
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toMatchObject({ orderId: "ord-1", orderNumber: 8228 });
    expect(tiles[1]).toMatchObject({ orderId: "ord-1", orderNumber: 8228 });
    expect(tiles[2]).toMatchObject({ orderId: "ord-2", orderNumber: 8231 });
  });

  it("treats zero / negative copies as one tile", () => {
    const sec = section([
      group("CANA-ALB", [
        line({
          orderId: "ord-1",
          orderNumber: 8228,
          files: [file({ id: "f1", copies: 0 }), file({ id: "f2", copies: -3 })],
        }),
      ]),
    ]);

    expect(flattenMugSectionTiles(sec)).toHaveLength(2);
  });
});

describe("filterMugTilesReadyForBatch", () => {
  it("keeps only tiles whose order is still waiting to print", () => {
    const tiles = [tile("ord-1", 8228), tile("ord-2", 8231)];
    const statuses = new Map([
      ["ord-1", MUG_BATCH_ELIGIBLE_STATUS],
      ["ord-2", "WORKSHOP_PRINTING"],
    ]);

    const fresh = filterMugTilesReadyForBatch(tiles, statuses);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.orderId).toBe("ord-1");
  });

  it("drops tiles whose order is missing from the snapshot", () => {
    expect(filterMugTilesReadyForBatch([tile("ord-1", 8228)], new Map())).toEqual(
      [],
    );
  });
});

describe("mugOrderIdsToPromote", () => {
  it("dedupes by order, preserving first-appearance order", () => {
    const tiles = [
      tile("ord-2", 8231),
      tile("ord-1", 8228),
      tile("ord-2", 8231),
    ];
    expect(mugOrderIdsToPromote(tiles)).toEqual(["ord-2", "ord-1"]);
  });
});

describe("splitMugTilesIntoSheets", () => {
  it("chunks by the sheet slot count", () => {
    expect(splitMugTilesIntoSheets([1, 2, 3, 4], MUG_SHEET_SLOTS)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("leaves a lone trailing tile on its own sheet", () => {
    expect(splitMugTilesIntoSheets([1, 2, 3], MUG_SHEET_SLOTS)).toEqual([
      [1, 2],
      [3],
    ]);
    expect(splitMugTilesIntoSheets([1], MUG_SHEET_SLOTS)).toEqual([[1]]);
  });

  it("returns nothing for an empty input", () => {
    expect(splitMugTilesIntoSheets([], MUG_SHEET_SLOTS)).toEqual([]);
  });

  it("rejects a nonsensical slot count", () => {
    expect(() => splitMugTilesIntoSheets([1], 0)).toThrow(/integer >= 1/);
    expect(() => splitMugTilesIntoSheets([1], 1.5)).toThrow(/integer >= 1/);
  });
});
