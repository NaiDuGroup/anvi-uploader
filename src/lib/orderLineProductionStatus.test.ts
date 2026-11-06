import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "@/lib/validations";
import {
  deriveOrderProductionSummary,
  isLineProductionStatus,
  LINE_PRODUCTION_STATUSES,
  lineStatusForOrderStatus,
  orderStatusKeepsLineStatuses,
} from "@/lib/orderLineProductionStatus";
import { newLineProductionFields, orderLinesStatusSyncWrite, planOrderStatusWrite } from "@/lib/orderLineStatusSync";
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
            // «Нужен макет» lines are never moved by an order-level write.
            where: { productionStatus: { notIn: [expected, "NEEDS_LAYOUT"] } },
            data: {
              productionStatus: expected,
              productionStatusAt: at,
              layoutIssueReason: null,
              layoutIssueNote: null,
              layoutIssueAt: null,
              layoutIssueById: null,
            },
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

describe("planOrderStatusWrite («Весь заказ» over «Нужен макет» lines)", () => {
  const ls = (...s: string[]) => s.map((productionStatus, i) => ({ id: `l${i + 1}`, productionStatus }));

  it("workshop phase: flagged lines are kept, the stored status is derived", () => {
    expect(planOrderStatusWrite("WORKSHOP_PRINTING", ls("WAITING", "NEEDS_LAYOUT"))).toEqual({
      ok: true,
      status: "WORKSHOP_PRINTING",
      keptLineIds: ["l2"],
    });
    expect(planOrderStatusWrite("WORKSHOP_READY", ls("PRINTING", "NEEDS_LAYOUT", "DONE"))).toEqual({
      ok: true,
      status: "WORKSHOP_PRINTING",
      keptLineIds: ["l2"],
    });
    expect(planOrderStatusWrite("SENT_TO_WORKSHOP", ls("PRINTING", "NEEDS_LAYOUT"))).toEqual({
      ok: true,
      status: "SENT_TO_WORKSHOP",
      keptLineIds: ["l2"],
    });
    // Every line flagged: nothing moves, the order waits.
    expect(planOrderStatusWrite("WORKSHOP_READY", ls("NEEDS_LAYOUT"))).toEqual({
      ok: true,
      status: "SENT_TO_WORKSHOP",
      keptLineIds: ["l1"],
    });
    // No flag: as requested; no lines (legacy): as requested.
    expect(planOrderStatusWrite("WORKSHOP_READY", ls("WAITING", "PRINTING"))).toEqual({ ok: true, status: "WORKSHOP_READY", keptLineIds: [] });
    expect(planOrderStatusWrite("WORKSHOP_READY", [])).toEqual({ ok: true, status: "WORKSHOP_READY", keptLineIds: [] });
  });

  it("outside the workshop phase: refused while a line is flagged", () => {
    for (const s of ["NEW", "IN_PROGRESS", "READY_IN_STUDIO", "RETURNED_TO_STUDIO", "DELIVERED"]) {
      expect(planOrderStatusWrite(s, ls("DONE", "NEEDS_LAYOUT", "NEEDS_LAYOUT"))).toEqual({ ok: false, needsLayoutLineIds: ["l2", "l3"] });
      expect(planOrderStatusWrite(s, ls("DONE", "WAITING"))).toEqual({ ok: true, status: s, keptLineIds: [] });
    }
  });

  it("ISSUE: allowed, lines untouched", () => {
    expect(planOrderStatusWrite("ISSUE", ls("NEEDS_LAYOUT"))).toEqual({ ok: true, status: "ISSUE", keptLineIds: [] });
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

  it("outside the workshop phase: reports only differing lines, grouped per order, sorted by number", () => {
    const res = findLineStatusMismatches([
      row({ orderId: "o2", orderNumber: 9, orderStatus: "READY_IN_STUDIO", lineId: "a", productionStatus: "DONE" }),
      row({ orderId: "o2", orderNumber: 9, orderStatus: "READY_IN_STUDIO", lineId: "b", sortOrder: 1, productionStatus: "WAITING" }),
      row({ orderId: "o1", orderNumber: 3, orderStatus: "DELIVERED", lineId: "c", deleted: true, productionStatus: "WAITING" }),
      row({ orderId: "o3", orderNumber: 1, orderStatus: "NEW", lineId: "d" }),
    ]);
    expect(res.ordersChecked).toBe(3);
    expect(res.ordersDerived).toBe(0);
    expect(res.linesChecked).toBe(4);
    expect(res.mismatches.map((m) => m.orderNumber)).toEqual([3, 9]);
    expect(res.mismatches[0]).toMatchObject({ deleted: true, rule: "lines_follow_order", expected: "DONE", lines: [{ id: "c" }] });
    expect(res.mismatches[1]).toMatchObject({ rule: "lines_follow_order", expected: "DONE", lines: [{ id: "b", sortOrder: 1 }] });
  });

  it("workshop phase: the order status must be the one derived from its lines (mixed lines are fine)", () => {
    const res = findLineStatusMismatches([
      // 9452: banner printing, mug + notebook waiting → WORKSHOP_PRINTING: OK.
      row({ orderId: "p", orderNumber: 9452, orderStatus: "WORKSHOP_PRINTING", lineId: "m", productionStatus: "WAITING" }),
      row({ orderId: "p", orderNumber: 9452, orderStatus: "WORKSHOP_PRINTING", lineId: "n", sortOrder: 1, productionStatus: "WAITING" }),
      row({ orderId: "p", orderNumber: 9452, orderStatus: "WORKSHOP_PRINTING", lineId: "b", sortOrder: 2, productionStatus: "PRINTING" }),
      // 9453: all done but still WORKSHOP_PRINTING → mismatch, all lines listed in order.
      row({ orderId: "q", orderNumber: 9453, orderStatus: "WORKSHOP_PRINTING", lineId: "y", sortOrder: 1, productionStatus: "DONE" }),
      row({ orderId: "q", orderNumber: 9453, orderStatus: "WORKSHOP_PRINTING", lineId: "x", sortOrder: 0, productionStatus: "DONE" }),
      // 9454: SENT_TO_WORKSHOP with a printing line → mismatch.
      row({ orderId: "r", orderNumber: 9454, orderStatus: "SENT_TO_WORKSHOP", lineId: "z", productionStatus: "PRINTING" }),
      // 9455: WORKSHOP_READY, all done: OK.
      row({ orderId: "s", orderNumber: 9455, orderStatus: "WORKSHOP_READY", lineId: "w", productionStatus: "DONE" }),
    ]);
    expect(res.ordersChecked).toBe(4);
    expect(res.ordersDerived).toBe(4);
    expect(res.mismatches.map((m) => [m.orderNumber, m.rule, m.expected])).toEqual([
      [9453, "order_from_lines", "WORKSHOP_READY"],
      [9454, "order_from_lines", "WORKSHOP_PRINTING"],
    ]);
    expect(res.mismatches[0]!.lines.map((l) => l.id)).toEqual(["x", "y"]);
  });

  it("skips ISSUE orders", () => {
    const res = findLineStatusMismatches([row({ orderStatus: "ISSUE", productionStatus: "DONE" })]);
    expect(res).toEqual({ ordersChecked: 0, linesChecked: 0, ordersSkipped: 1, ordersDerived: 0, mismatches: [] });
  });
});
