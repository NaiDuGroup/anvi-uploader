import { describe, expect, it } from "vitest";
import { LINE_PRODUCTION_STATUSES, type LineProductionStatus } from "@/lib/orderLineProductionStatus";
import { ORDER_STATUSES } from "@/lib/validations";
import {
  SETTABLE_LINE_STATUSES,
  WORKSHOP_PHASE_STATUSES,
  boardLineStatus,
  canSetLineStatus,
  deriveWorkshopOrderStatus,
  isLineWaiting,
  isSettableLineStatus,
  isWorkshopPhaseStatus,
  orderStatusForLineStatus,
} from "@/lib/orderStatusFromLines";

const ls = (...s: string[]) => s.map((productionStatus) => ({ productionStatus }));

/** Every multiset of line statuses of length 1..maxLen (order does not matter). */
function combos(maxLen: number): LineProductionStatus[][] {
  const out: LineProductionStatus[][] = [];
  const rec = (prefix: LineProductionStatus[], from: number) => {
    if (prefix.length > 0) out.push(prefix);
    if (prefix.length === maxLen) return;
    for (let i = from; i < LINE_PRODUCTION_STATUSES.length; i += 1) {
      rec([...prefix, LINE_PRODUCTION_STATUSES[i]!], i);
    }
  };
  rec([], 0);
  return out;
}

/** The rule from the spec, written independently of the implementation. */
function expected(lines: LineProductionStatus[]): string {
  const w = lines.map((s) => (s === "NEEDS_LAYOUT" ? "WAITING" : s));
  if (w.every((s) => s === "WAITING")) return "SENT_TO_WORKSHOP";
  if (w.every((s) => s === "DONE")) return "WORKSHOP_READY";
  return "WORKSHOP_PRINTING";
}

describe("deriveWorkshopOrderStatus", () => {
  it("matches the rule for every combination of up to 4 lines", () => {
    const all = combos(4);
    // 4 + 10 + 20 + 35 multisets of the 4 statuses.
    expect(all).toHaveLength(69);
    for (const c of all) {
      expect(deriveWorkshopOrderStatus(ls(...c)), c.join(",")).toBe(expected(c));
      // Line order never matters.
      expect(deriveWorkshopOrderStatus(ls(...[...c].reverse())), c.join(",")).toBe(expected(c));
    }
  });

  it("the cases from the brief (mug + notebook + banner)", () => {
    expect(deriveWorkshopOrderStatus(ls("WAITING", "WAITING", "WAITING"))).toBe("SENT_TO_WORKSHOP");
    expect(deriveWorkshopOrderStatus(ls("WAITING", "WAITING", "PRINTING"))).toBe("WORKSHOP_PRINTING");
    expect(deriveWorkshopOrderStatus(ls("DONE", "WAITING", "WAITING"))).toBe("WORKSHOP_PRINTING");
    expect(deriveWorkshopOrderStatus(ls("DONE", "DONE", "PRINTING"))).toBe("WORKSHOP_PRINTING");
    expect(deriveWorkshopOrderStatus(ls("DONE", "DONE", "DONE"))).toBe("WORKSHOP_READY");
  });

  it("NEEDS_LAYOUT counts as WAITING; unknown values too", () => {
    expect(deriveWorkshopOrderStatus(ls("NEEDS_LAYOUT"))).toBe("SENT_TO_WORKSHOP");
    expect(deriveWorkshopOrderStatus(ls("NEEDS_LAYOUT", "WAITING"))).toBe("SENT_TO_WORKSHOP");
    expect(deriveWorkshopOrderStatus(ls("NEEDS_LAYOUT", "DONE"))).toBe("WORKSHOP_PRINTING");
    expect(deriveWorkshopOrderStatus(ls("bogus", "DONE"))).toBe("WORKSHOP_PRINTING");
    expect(deriveWorkshopOrderStatus(ls("bogus"))).toBe("SENT_TO_WORKSHOP");
  });

  it("no lines → null (nothing to derive)", () => {
    expect(deriveWorkshopOrderStatus([])).toBeNull();
  });

  it("a single line maps like orderStatusForLineStatus", () => {
    for (const s of LINE_PRODUCTION_STATUSES) {
      expect(deriveWorkshopOrderStatus(ls(s))).toBe(orderStatusForLineStatus(s));
    }
  });
});

describe("phase rules", () => {
  it("only SENT_TO_WORKSHOP / WORKSHOP_PRINTING / WORKSHOP_READY are derived", () => {
    expect([...WORKSHOP_PHASE_STATUSES]).toEqual(["SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY"]);
    const derived = ORDER_STATUSES.filter((s) => isWorkshopPhaseStatus(s));
    expect(derived).toEqual([...WORKSHOP_PHASE_STATUSES]);
  });

  it("line status can be set only in the workshop phase (studio orders, ISSUE and finished orders: no)", () => {
    for (const s of ORDER_STATUSES) {
      expect(canSetLineStatus(s), s).toBe((WORKSHOP_PHASE_STATUSES as readonly string[]).includes(s));
    }
    for (const s of ["NEW", "IN_PROGRESS", "READY_IN_STUDIO", "RETURNED_TO_STUDIO", "DELIVERED", "ISSUE"]) {
      expect(canSetLineStatus(s), s).toBe(false);
    }
    expect(canSetLineStatus("bogus")).toBe(false);
  });

  it("the API accepts WAITING / PRINTING / DONE; NEEDS_LAYOUT is reserved", () => {
    expect([...SETTABLE_LINE_STATUSES]).toEqual(["WAITING", "PRINTING", "DONE"]);
    expect(isSettableLineStatus("NEEDS_LAYOUT")).toBe(false);
    expect(isSettableLineStatus("PRINTING")).toBe(true);
    expect(isSettableLineStatus(1)).toBe(false);
  });

  it("isLineWaiting: WAITING and NEEDS_LAYOUT", () => {
    expect(LINE_PRODUCTION_STATUSES.filter(isLineWaiting)).toEqual(["WAITING", "NEEDS_LAYOUT"]);
  });
});

describe("boardLineStatus", () => {
  it("in the workshop phase shows the line's own status", () => {
    for (const o of WORKSHOP_PHASE_STATUSES) {
      expect(boardLineStatus(o, "WAITING")).toBe("SENT_TO_WORKSHOP");
      expect(boardLineStatus(o, "NEEDS_LAYOUT")).toBe("SENT_TO_WORKSHOP");
      expect(boardLineStatus(o, "PRINTING")).toBe("WORKSHOP_PRINTING");
      expect(boardLineStatus(o, "DONE")).toBe("WORKSHOP_READY");
    }
  });

  it("outside it shows the order's status", () => {
    expect(boardLineStatus("RETURNED_TO_STUDIO", "WAITING")).toBe("RETURNED_TO_STUDIO");
    expect(boardLineStatus("DELIVERED", "DONE")).toBe("DELIVERED");
    expect(boardLineStatus("ISSUE", "PRINTING")).toBe("ISSUE");
  });
});

describe("deriveWorkshopOrderStatus: «Нужен макет» lines (step 3) count as WAITING", () => {
  it.each([
    [["NEEDS_LAYOUT"], "SENT_TO_WORKSHOP"],
    [["NEEDS_LAYOUT", "NEEDS_LAYOUT"], "SENT_TO_WORKSHOP"],
    [["NEEDS_LAYOUT", "NEEDS_LAYOUT", "WAITING"], "SENT_TO_WORKSHOP"],
    [["NEEDS_LAYOUT", "DONE"], "WORKSHOP_PRINTING"],
    [["NEEDS_LAYOUT", "DONE", "DONE"], "WORKSHOP_PRINTING"],
    [["NEEDS_LAYOUT", "PRINTING"], "WORKSHOP_PRINTING"],
    [["NEEDS_LAYOUT", "WAITING", "PRINTING"], "WORKSHOP_PRINTING"],
    [["NEEDS_LAYOUT", "WAITING", "DONE"], "WORKSHOP_PRINTING"],
    [["NEEDS_LAYOUT", "PRINTING", "DONE"], "WORKSHOP_PRINTING"],
  ])("%j → %s", (lines, expected) => {
    expect(deriveWorkshopOrderStatus(ls(...lines))).toBe(expected);
  });

  it("never derives WORKSHOP_READY while a line waits for a layout", () => {
    for (const c of combos(4)) {
      if (c.includes("NEEDS_LAYOUT")) {
        expect(deriveWorkshopOrderStatus(ls(...c))).not.toBe("WORKSHOP_READY");
      }
    }
  });

  it("flagging or fixing a line never changes the derived status (NEEDS_LAYOUT ≡ WAITING)", () => {
    for (const c of combos(4)) {
      const asWaiting = c.map((s) => (s === "NEEDS_LAYOUT" ? "WAITING" : s));
      expect(deriveWorkshopOrderStatus(ls(...c))).toBe(deriveWorkshopOrderStatus(ls(...asWaiting)));
    }
  });

  it("a single flagged line stands for SENT_TO_WORKSHOP", () => {
    expect(orderStatusForLineStatus("NEEDS_LAYOUT")).toBe("SENT_TO_WORKSHOP");
  });
});
