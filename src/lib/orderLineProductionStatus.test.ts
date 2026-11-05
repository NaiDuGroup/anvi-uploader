import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "@/lib/validations";
import {
  deriveOrderProductionSummary,
  isLineProductionStatus,
  LINE_PRODUCTION_STATUSES,
  lineStatusForOrderStatus,
  orderStatusKeepsLineStatuses,
} from "@/lib/orderLineProductionStatus";
import { newLineProductionFields, orderLinesStatusSyncWrite } from "@/lib/orderLineStatusSync";
import { findLineStatusMismatches, type LineStatusRow } from "@/lib/orderLineStatusCheck";

const EXPECTED: Record<(typeof ORDER_STATUSES)[number], string> = {
  NEW: "WAITING",
  IN_PROGRESS: "WAITING",
  SENT_TO_WORKSHOP: "WAITING",
  ISSUE: "WAITING",
  WORKSHOP_PRINTING: "PRINTING",
  WORKSHOP_READY: "DONE",
  READY_IN_STUDIO: "DONE",
  RETURNED_TO_STUDIO: "DONE",
  DELIVERED: "DONE",
};

describe("lineStatusForOrderStatus", () => {
  it.each(ORDER_STATUSES.map((s) => [s, EXPECTED[s]]))("%s → %s", (orderStatus, line) => {
    expect(lineStatusForOrderStatus(orderStatus)).toBe(line);
  });

  it("covers every ORDER_STATUS with a known line status", () => {
    for (const s of ORDER_STATUSES) expect(LINE_PRODUCTION_STATUSES).toContain(lineStatusForOrderStatus(s));
  });

  it("maps unknown / odd values to WAITING", () => {
    for (const s of ["", "CANCELLED", "new", "toString", "__proto__", "constructor"]) {
      expect(lineStatusForOrderStatus(s)).toBe("WAITING");
    }
  });

  it("never produces NEEDS_LAYOUT in step 1", () => {
    expect(ORDER_STATUSES.map(lineStatusForOrderStatus)).not.toContain("NEEDS_LAYOUT");
    expect(LINE_PRODUCTION_STATUSES).toContain("NEEDS_LAYOUT");
  });

  it("matches the migration backfill CASE", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const sql = readFileSync(
      path.resolve(__dirname, "../../prisma/migrations/20261106120000_order_line_production_status/migration.sql"),
      "utf8",
    );
    const fromSql = new Map<string, string>();
    for (const m of sql.matchAll(/WHEN '([A-Z_]+)' THEN '([A-Z_]+)'/g)) fromSql.set(m[1]!, m[2]!);
    for (const s of ORDER_STATUSES) {
      expect(fromSql.get(s) ?? "WAITING", s).toBe(lineStatusForOrderStatus(s));
    }
    expect(sql).toContain("ELSE 'WAITING'");
  });
});

describe("isLineProductionStatus", () => {
  it("accepts the four statuses only", () => {
    for (const s of LINE_PRODUCTION_STATUSES) expect(isLineProductionStatus(s)).toBe(true);
    expect(isLineProductionStatus("waiting")).toBe(false);
    expect(isLineProductionStatus(null)).toBe(false);
  });
});

describe("ISSUE keeps lines", () => {
  it("only ISSUE keeps line statuses", () => {
    expect(ORDER_STATUSES.filter(orderStatusKeepsLineStatuses)).toEqual(["ISSUE"]);
  });

  it("orderLinesStatusSyncWrite is empty for ISSUE and when no status is written", () => {
    expect(orderLinesStatusSyncWrite("ISSUE")).toEqual({});
    expect(orderLinesStatusSyncWrite(undefined)).toEqual({});
    expect(orderLinesStatusSyncWrite(null)).toEqual({});
  });

  it("orderLinesStatusSyncWrite updates only lines that differ, with the timestamp", () => {
    const at = new Date("2026-11-06T10:00:00Z");
    for (const s of ORDER_STATUSES.filter((x) => x !== "ISSUE")) {
      const expected = EXPECTED[s];
      expect(orderLinesStatusSyncWrite(s, at)).toEqual({
        orderLines: {
          updateMany: {
            where: { productionStatus: { not: expected } },
            data: { productionStatus: expected, productionStatusAt: at },
          },
        },
      });
    }
  });

  it("new lines take the mapped status (ISSUE order → WAITING)", () => {
    expect(newLineProductionFields("WORKSHOP_PRINTING")).toEqual({ productionStatus: "PRINTING" });
    expect(newLineProductionFields("DELIVERED")).toEqual({ productionStatus: "DONE" });
    expect(newLineProductionFields("ISSUE")).toEqual({ productionStatus: "WAITING" });
    expect(newLineProductionFields("NEW")).toEqual({ productionStatus: "WAITING" });
  });
});

describe("deriveOrderProductionSummary", () => {
  const lines = (...s: string[]) => s.map((productionStatus) => ({ productionStatus }));

  it("no lines", () => {
    expect(deriveOrderProductionSummary([])).toEqual({
      total: 0,
      counts: { WAITING: 0, NEEDS_LAYOUT: 0, PRINTING: 0, DONE: 0 },
      uniform: null,
      allDone: false,
      anyStarted: false,
    });
  });

  it("counts per status, e.g. 1 of 3 needs a layout", () => {
    const s = deriveOrderProductionSummary(lines("NEEDS_LAYOUT", "PRINTING", "DONE"));
    expect(s.total).toBe(3);
    expect(s.counts).toEqual({ WAITING: 0, NEEDS_LAYOUT: 1, PRINTING: 1, DONE: 1 });
    expect(s.uniform).toBeNull();
    expect(s.allDone).toBe(false);
    expect(s.anyStarted).toBe(true);
  });

  it("uniform status", () => {
    expect(deriveOrderProductionSummary(lines("WAITING", "WAITING")).uniform).toBe("WAITING");
    const done = deriveOrderProductionSummary(lines("DONE", "DONE", "DONE"));
    expect(done.uniform).toBe("DONE");
    expect(done.allDone).toBe(true);
    expect(done.anyStarted).toBe(true);
  });

  it("nothing started while all wait", () => {
    const s = deriveOrderProductionSummary(lines("WAITING", "NEEDS_LAYOUT"));
    expect(s.anyStarted).toBe(false);
    expect(s.allDone).toBe(false);
  });

  it("unknown values count as WAITING", () => {
    const s = deriveOrderProductionSummary(lines("weird", "DONE"));
    expect(s.counts).toEqual({ WAITING: 1, NEEDS_LAYOUT: 0, PRINTING: 0, DONE: 1 });
    expect(s.total).toBe(2);
  });

  it("does not mutate input", () => {
    const input = Object.freeze(lines("DONE").map((l) => Object.freeze(l)));
    expect(() => deriveOrderProductionSummary(input)).not.toThrow();
  });
});

describe("findLineStatusMismatches", () => {
  const row = (p: Partial<LineStatusRow>): LineStatusRow => ({
    orderId: "o1",
    orderNumber: 1,
    orderStatus: "NEW",
    deleted: false,
    lineId: "l1",
    sortOrder: 0,
    productionStatus: "WAITING",
    ...p,
  });

  it("reports only differing lines, grouped per order, sorted by number", () => {
    const res = findLineStatusMismatches([
      row({ orderId: "o2", orderNumber: 9, orderStatus: "WORKSHOP_PRINTING", lineId: "a", productionStatus: "PRINTING" }),
      row({ orderId: "o2", orderNumber: 9, orderStatus: "WORKSHOP_PRINTING", lineId: "b", sortOrder: 1, productionStatus: "WAITING" }),
      row({ orderId: "o1", orderNumber: 3, orderStatus: "DELIVERED", lineId: "c", deleted: true, productionStatus: "WAITING" }),
      row({ orderId: "o3", orderNumber: 1, orderStatus: "NEW", lineId: "d" }),
    ]);
    expect(res.ordersChecked).toBe(3);
    expect(res.linesChecked).toBe(4);
    expect(res.mismatches.map((m) => m.orderNumber)).toEqual([3, 9]);
    expect(res.mismatches[0]).toMatchObject({ deleted: true, expected: "DONE", lines: [{ id: "c" }] });
    expect(res.mismatches[1]).toMatchObject({ expected: "PRINTING", lines: [{ id: "b", sortOrder: 1 }] });
  });

  it("skips ISSUE orders", () => {
    const res = findLineStatusMismatches([row({ orderStatus: "ISSUE", productionStatus: "DONE" })]);
    expect(res).toEqual({ ordersChecked: 0, linesChecked: 0, ordersSkipped: 1, mismatches: [] });
  });
});
