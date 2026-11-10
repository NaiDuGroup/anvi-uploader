import { describe, expect, it } from "vitest";
import { buildSettlementAct } from "./act";
import { actPeriodStart, entryDay, ledgerTotals, parseSettlementPeriod, sliceLedger, withRunningBalance } from "./period";
import { fmtDate } from "@/lib/reconciliation/actPdf";
import type { LedgerEntry } from "./types";

const L = (rows: Array<[LedgerEntry["kind"], string | null, number]>) =>
  withRunningBalance(rows.map(([kind, date, amount]) => ({ kind, date, amount, document: "D", description: null })));

describe("QA period edges", () => {
  it("23:30 UTC belongs to next Chișinău day (winter + summer)", () => {
    expect(entryDay({ date: "2026-01-31T22:30:00Z" })).toBe("2026-02-01");
    expect(entryDay({ date: "2026-06-30T21:30:00Z" })).toBe("2026-07-01");
    expect(entryDay({ date: "2026-06-30T20:59:00Z" })).toBe("2026-06-30");
    // DST change 2026-03-29 (03:00 → 04:00) and 2026-10-25
    expect(entryDay({ date: "2026-03-28T21:59:00Z" })).toBe("2026-03-28");
    expect(entryDay({ date: "2026-03-28T22:00:00Z" })).toBe("2026-03-29");
    expect(entryDay({ date: "2026-10-24T20:59:00Z" })).toBe("2026-10-24");
    expect(entryDay({ date: "2026-10-24T21:00:00Z" })).toBe("2026-10-25");
    expect(entryDay({ date: "2026-10-25T21:59:00Z" })).toBe("2026-10-25");
    expect(entryDay({ date: "2026-10-25T22:00:00Z" })).toBe("2026-10-26");
  });
  it("entry exactly on from / to is inside, before goes to opening", () => {
    const s = sliceLedger(L([["sale_invoice", "2026-01-31T21:59:00Z", 10], ["sale_invoice", "2026-01-31T22:00:00Z", 20], ["payment_in", "2026-02-28T21:59:00Z", -5], ["payment_in", "2026-02-28T22:00:00Z", -7]]), { from: "2026-02-01", to: "2026-02-28" });
    expect(s.opening).toBe(10);
    expect(s.entries.map((e) => e.amount)).toEqual([20, -5]);
    expect(s.closing).toBe(25);
  });
  it("opening balance inside / after the period", () => {
    const rows = L([["opening_balance", "2026-03-15T12:00:00Z", 100], ["sale_invoice", "2026-03-01T00:00:00Z", 10]]);
    // inside: counted in opening even though dated mid-period
    const s = sliceLedger(rows, { from: "2026-03-01", to: "2026-03-31" });
    expect(s.opening).toBe(100);
    expect(s.closing).toBe(110);
    // after: ignored
    const a = sliceLedger(rows, { from: "2026-01-01", to: "2026-02-28" });
    expect(a.opening).toBe(0);
    expect(a.closing).toBe(0);
  });
  it("undated entries vanish from periods with `to`", () => {
    const rows = L([["sale_invoice", null, 50]]);
    expect(sliceLedger(rows, { from: null, to: null }).closing).toBe(50);
    expect(sliceLedger(rows, { from: "2026-01-01", to: "2026-12-31" }).closing).toBe(0);
  });
  it("parse period", () => {
    expect(parseSettlementPeriod("2026-12-31", "2026-01-01")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(parseSettlementPeriod("2026-02-30", "garbage")).toEqual({ from: null, to: null });
    expect(parseSettlementPeriod(null, "2026-02-28")).toEqual({ from: null, to: "2026-02-28" });
  });
  it("act totals == sum rows, closing == slice closing, float rounding", () => {
    const rows = L([["opening_balance", "2025-12-31T12:00:00Z", -0.1], ["sale_invoice", "2026-01-02T00:00:00Z", 0.1], ["sale_invoice", "2026-01-02T00:00:00Z", 0.2], ["payment_in", "2026-01-03T00:00:00Z", -0.3], ["refund", "2026-01-04T00:00:00Z", 0.0049]]);
    const s = sliceLedger(rows, { from: null, to: null });
    const act = buildSettlementAct(s);
    expect(act.debitTotal).toBe(0.3);
    expect(act.creditTotal).toBe(0.3);
    expect(act.closing).toBe(s.closing);
    expect(act.closing).toBe(-0.1);
    expect(act.inFavourOf).toBe("them");
    const t = ledgerTotals(s.entries);
    expect(t.debit - t.credit).toBeCloseTo(s.closing - s.opening, 2);
  });
  it("fmtDate prints the Chișinău day whatever the process TZ (PDF on a UTC server)", () => {
    // 22:30Z on 31.03 (summer, UTC+3) is 01.04 in Chișinău; 21:30Z in winter (UTC+2) too.
    expect(fmtDate("2026-03-31T22:30:00Z")).toBe("01.04.2026");
    expect(entryDay({ date: "2026-03-31T22:30:00Z" })).toBe("2026-04-01");
    expect(fmtDate("2026-01-31T22:30:00Z")).toBe("01.02.2026");
    expect(fmtDate("2026-01-31T21:30:00Z")).toBe("31.01.2026");
    expect(fmtDate("not a date")).toBe("not a date");
  });

  it("act subtitle start: min(opening as-of, first entry), only when the opening is included", () => {
    const entries = [{ date: "2026-02-10T10:00:00Z" }, { date: "2026-01-05T10:00:00Z" }];
    // Opening dated after the first document → the first document day.
    expect(actPeriodStart({ from: null, to: null }, entries, "2026-01-20")).toBe("2026-01-05");
    // Opening earlier → its day.
    expect(actPeriodStart({ from: null, to: null }, entries, "2025-12-31")).toBe("2025-12-31");
    // Opening dated after `to` is not in the act → ignored.
    expect(actPeriodStart({ from: null, to: "2026-03-01" }, entries, "2026-06-30")).toBe("2026-01-05");
    expect(actPeriodStart({ from: null, to: "2026-03-01" }, [], "2026-06-30")).toBeNull();
    // Explicit start wins.
    expect(actPeriodStart({ from: "2026-02-01", to: null }, entries, "2025-12-31")).toBe("2026-02-01");
  });
});
