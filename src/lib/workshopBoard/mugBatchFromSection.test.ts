import { describe, expect, it } from "vitest";
import { lineStatusForOrderStatus } from "@/lib/orderLineProductionStatus";
import { MUG_SHEET_SLOTS } from "@/lib/mug/composeMugSheetPng";
import {
  MUG_BATCH_ELIGIBLE_STATUS,
  filterMugTilesReadyForBatch,
  flattenMugSectionTiles,
  mugLineStatusSnapshot,
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
  /** The line's own status; default: what the order status maps to (step 1). */
  lineStatus?: string;
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
    lineStatus: partial.lineStatus ?? lineStatusForOrderStatus(partial.status ?? MUG_BATCH_ELIGIBLE_STATUS),
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
    key: "mug",
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

describe("filterMugTilesReadyForBatch (line status)", () => {
  it("keeps only tiles whose LINE is still waiting to print", () => {
    const tiles = [tile("ord-1", 8228), tile("ord-2", 8231)];
    const statuses = new Map([
      ["ord-1::line-1", MUG_BATCH_ELIGIBLE_STATUS],
      ["ord-2::line-1", "WORKSHOP_PRINTING"],
    ]);

    const fresh = filterMugTilesReadyForBatch(tiles, statuses);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.orderId).toBe("ord-1");
  });

  it("drops tiles whose line is missing from the snapshot", () => {
    expect(filterMugTilesReadyForBatch([tile("ord-1", 8228)], new Map())).toEqual(
      [],
    );
  });

  it("includes a waiting mug of an order whose banner is printing (order WORKSHOP_PRINTING)", () => {
    const sec = section([
      group("CANA-ALB", [
        line({
          orderId: "ord-9452",
          orderLineId: "mug-line",
          orderNumber: 9452,
          status: "WORKSHOP_PRINTING",
          lineStatus: "WAITING",
          files: [file({ id: "f-mug" })],
        }),
        line({
          orderId: "ord-9460",
          orderLineId: "mug-printing",
          orderNumber: 9460,
          status: "WORKSHOP_PRINTING",
          lineStatus: "PRINTING",
          files: [file({ id: "f-printing" })],
        }),
        line({
          orderId: "ord-9470",
          orderLineId: "mug-done",
          orderNumber: 9470,
          status: "WORKSHOP_PRINTING",
          lineStatus: "DONE",
          files: [file({ id: "f-done" })],
        }),
        line({
          orderId: "ord-9480",
          orderLineId: "mug-needs-layout",
          orderNumber: 9480,
          status: "SENT_TO_WORKSHOP",
          lineStatus: "NEEDS_LAYOUT",
          files: [file({ id: "f-nl" })],
        }),
      ]),
    ]);
    const snapshot = mugLineStatusSnapshot(sec);
    expect(snapshot.get("ord-9452::mug-line")).toBe("SENT_TO_WORKSHOP");
    const fresh = filterMugTilesReadyForBatch(flattenMugSectionTiles(sec), snapshot);
    // Step 3: a «Нужен макет» mug is never batched (its own snapshot word).
    expect(snapshot.get("ord-9480::mug-needs-layout")).toBe("NEEDS_LAYOUT");
    expect(fresh.map((t) => t.orderLineId)).toEqual(["mug-line"]);
  });

  it("excludes every line of a finished order, whatever the line says", () => {
    const sec = section([
      group("CANA-ALB", [
        line({
          orderId: "ord-1",
          orderNumber: 1,
          status: "RETURNED_TO_STUDIO",
          lineStatus: "WAITING",
          files: [file()],
        }),
      ]),
    ]);
    expect(filterMugTilesReadyForBatch(flattenMugSectionTiles(sec), mugLineStatusSnapshot(sec))).toEqual([]);
  });

  it("keys lines per order, so legacy lines of two orders do not collide", () => {
    const sec = section([
      group("CANA-ALB", [
        line({ orderId: "a", orderLineId: "legacy", orderNumber: 1, status: "SENT_TO_WORKSHOP", files: [file()] }),
        line({ orderId: "b", orderLineId: "legacy", orderNumber: 2, status: "WORKSHOP_PRINTING", files: [file()] }),
      ]),
    ]);
    const fresh = filterMugTilesReadyForBatch(flattenMugSectionTiles(sec), mugLineStatusSnapshot(sec));
    expect(fresh.map((t) => t.orderId)).toEqual(["a"]);
  });
});

describe("«Нужен макет» mugs (step 3)", () => {
  it("a flagged mug of a multi-mug order is skipped, its sibling mug and other orders are batched", () => {
    const sec = section([
      group("CANA-ALB", [
        line({ orderId: "o1", orderLineId: "m1", orderNumber: 9751, status: "SENT_TO_WORKSHOP", lineStatus: "WAITING", files: [file({ id: "a", copies: 2 })] }),
        line({ orderId: "o1", orderLineId: "m2", orderNumber: 9751, status: "SENT_TO_WORKSHOP", lineStatus: "NEEDS_LAYOUT", files: [file({ id: "b", copies: 3 })] }),
        line({ orderId: "o2", orderLineId: "m3", orderNumber: 9752, status: "SENT_TO_WORKSHOP", lineStatus: "WAITING", files: [file({ id: "c" })] }),
      ]),
    ]);
    const snap = mugLineStatusSnapshot(sec);
    expect(snap.get("o1::m2")).toBe("NEEDS_LAYOUT");
    expect(snap.get("o1::m1")).toBe(MUG_BATCH_ELIGIBLE_STATUS);
    const fresh = filterMugTilesReadyForBatch(flattenMugSectionTiles(sec), snap);
    expect(fresh.map((t) => t.orderLineId)).toEqual(["m1", "m1", "m3"]);
    expect(mugOrderIdsToPromote(fresh)).toEqual(["o1", "o2"]);
  });

  it("a flagged mug of a printing order is skipped too", () => {
    const sec = section([
      group("CANA-ALB", [
        line({ orderId: "o1", orderLineId: "m1", orderNumber: 1, status: "WORKSHOP_PRINTING", lineStatus: "NEEDS_LAYOUT", files: [file()] }),
      ]),
    ]);
    expect(filterMugTilesReadyForBatch(flattenMugSectionTiles(sec), mugLineStatusSnapshot(sec))).toEqual([]);
  });

  it("once fixed (back to WAITING) the mug is batched again", () => {
    const sec = section([
      group("CANA-ALB", [
        line({ orderId: "o1", orderLineId: "m1", orderNumber: 1, status: "SENT_TO_WORKSHOP", lineStatus: "WAITING", files: [file()] }),
      ]),
    ]);
    expect(filterMugTilesReadyForBatch(flattenMugSectionTiles(sec), mugLineStatusSnapshot(sec))).toHaveLength(1);
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
