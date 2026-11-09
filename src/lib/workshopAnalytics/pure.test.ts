import { describe, expect, it } from "vitest";
import {
  analyticsSectionKey,
  chisinauWeekdayHour,
  durationStats,
  flagResolveSeconds,
  formatDurationSec,
  heatmapGrid,
  issueReasonCodeFromText,
  percentile,
  mergeStaffRows,
  problemKind,
  slowestStatus,
  statsByStatus,
  timeInStatusSegments,
  UNKNOWN_USER_ID,
  visibleStatusRows,
} from "./pure";
import { issueReasonLabelSets } from "./reasonLabels";

const H = 3_600_000;

describe("percentile", () => {
  it("matches percentile_cont (linear interpolation)", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5], 0.9)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1);
  });
  it("durationStats", () => {
    expect(durationStats([60, 120, 180])).toEqual({ count: 3, medianSec: 120, p90Sec: 168 });
  });
});

describe("timeInStatusSegments", () => {
  const created = new Date("2026-11-02T08:00:00Z");
  it("splits creation → changes → open tail", () => {
    const segs = timeInStatusSegments(
      created,
      [
        { at: created.getTime() + 2 * H, from: "NEW", to: "SENT_TO_WORKSHOP" },
        { at: created.getTime() + 5 * H, from: "SENT_TO_WORKSHOP", to: "WORKSHOP_PRINTING" },
      ],
      created.getTime() + 6 * H,
    );
    expect(segs.map((s) => [s.status, s.durationSec / 3600, s.open])).toEqual([
      ["NEW", 2, false],
      ["SENT_TO_WORKSHOP", 3, false],
      ["WORKSHOP_PRINTING", 1, true],
    ]);
  });
  it("sorts events and falls back to the previous status when `from` is missing", () => {
    const segs = timeInStatusSegments(created, [
      { at: created.getTime() + 3 * H, from: null, to: "DELIVERED" },
      { at: created.getTime() + 1 * H, from: "NEW", to: "ISSUE" },
    ]);
    expect(segs[0]).toMatchObject({ status: "NEW", durationSec: 3600 });
    expect(segs[1]).toMatchObject({ status: "ISSUE", durationSec: 7200 });
    const stats = statsByStatus(segs);
    expect(stats.get("ISSUE")).toEqual({ count: 1, medianSec: 7200, p90Sec: 7200 });
    expect(stats.has("DELIVERED")).toBe(false); // open tail not counted
  });
});

describe("slowestStatus", () => {
  it("highest median with enough data, terminal statuses ignored", () => {
    expect(
      slowestStatus([
        { status: "NEW", count: 10, medianSec: 100, p90Sec: 200 },
        { status: "ISSUE", count: 2, medianSec: 9999, p90Sec: 9999 },
        { status: "SENT_TO_WORKSHOP", count: 5, medianSec: 500, p90Sec: 900 },
        { status: "DELIVERED", count: 50, medianSec: 99999, p90Sec: 99999 },
      ]),
    ).toBe("SENT_TO_WORKSHOP");
    expect(slowestStatus([])).toBeNull();
  });

  it("ignores statuses that only wait for the client", () => {
    expect(
      slowestStatus([
        { status: "IN_WORKSHOP", count: 10, medianSec: 3600, p90Sec: 7200 },
        { status: "READY_IN_STUDIO", count: 20, medianSec: 86400, p90Sec: 300000 },
        { status: "RETURNED_TO_STUDIO", count: 8, medianSec: 50000, p90Sec: 90000 },
      ]),
    ).toBe("IN_WORKSHOP");
    expect(slowestStatus([{ status: "READY_IN_STUDIO", count: 20, medianSec: 86400, p90Sec: 1 }])).toBeNull();
  });
});

describe("visibleStatusRows", () => {
  it("drops the final DELIVERED status, keeps the rest", () => {
    const rows = [
      { status: "NEW", section: null },
      { status: "DELIVERED", section: null },
      { status: "DELIVERED", section: "dtf" },
      { status: "READY_IN_STUDIO", section: null },
    ];
    expect(visibleStatusRows(rows).map((r) => r.status)).toEqual(["NEW", "READY_IN_STUDIO"]);
  });
});

describe("mergeStaffRows", () => {
  const row = (userId: string, name: string, known: boolean, s: number, l = 0, f = 0) => ({
    userId,
    name,
    role: null,
    statusChanges: s,
    lineChanges: l,
    flags: f,
    known,
  });
  it("merges null / deleted users into one row and sorts by total", () => {
    const out = mergeStaffRows([
      row("u1", "Анна", true, 5),
      row("", "", false, 3, 1),
      row("gone", "", false, 2, 0, 1),
      row("u2", "Ион", true, 1),
      row("u3", "Пусто", true, 0),
    ]);
    expect(out.map((r) => r.userId)).toEqual([UNKNOWN_USER_ID, "u1", "u2"]);
    expect(out[0]).toMatchObject({ statusChanges: 5, lineChanges: 1, flags: 1 });
  });
  it("no unknown row when every user exists", () => {
    expect(mergeStaffRows([row("u1", "Анна", true, 1)]).map((r) => r.userId)).toEqual(["u1"]);
  });
});

describe("problemKind", () => {
  const labels = issueReasonLabelSets();
  it("file when a line was flagged or a reason maps to a file key", () => {
    expect(problemKind({ hadFlag: true, reasons: [] }, labels)).toBe("file");
    expect(problemKind({ hadFlag: false, reasons: [{ text: "x", code: "lowQuality" }] }, labels)).toBe("file");
    expect(problemKind({ hadFlag: false, reasons: [{ text: labels.fileCorrupt![0]!, code: null }] }, labels)).toBe("file");
  });
  it("other for own texts and missing reasons", () => {
    expect(problemKind({ hadFlag: false, reasons: [{ text: "нет красных ручек", code: null }] }, labels)).toBe("other");
    expect(problemKind({ hadFlag: false, reasons: [{ text: null, code: null }] }, labels)).toBe("other");
  });
});

describe("Chișinău hour bucketing", () => {
  it("winter (UTC+2) and summer (UTC+3)", () => {
    // Monday 2026-11-09 22:30 UTC = Tuesday 00:30 Chișinău
    expect(chisinauWeekdayHour(new Date("2026-11-09T22:30:00Z"))).toEqual({ weekday: 1, hour: 0 });
    // Sunday 2026-07-05 21:10 UTC = Monday 00:10 Chișinău (UTC+3)
    expect(chisinauWeekdayHour(new Date("2026-07-05T21:10:00Z"))).toEqual({ weekday: 0, hour: 0 });
    expect(chisinauWeekdayHour(new Date("2026-07-05T08:00:00Z"))).toEqual({ weekday: 6, hour: 11 });
  });
  it("heatmapGrid places isodow/hour rows", () => {
    const g = heatmapGrid([
      { isodow: 1, hour: 9, count: 3 },
      { isodow: 7, hour: 23, count: 1 },
      { isodow: 8, hour: 1, count: 5 },
    ]);
    expect(g).toHaveLength(7);
    expect(g[0]![9]).toBe(3);
    expect(g[6]![23]).toBe(1);
    expect(g.flat().reduce((a, b) => a + b, 0)).toBe(4);
  });
});

describe("issueReasonCodeFromText", () => {
  const labels = issueReasonLabelSets();
  it("maps labels of any locale back to codes", () => {
    expect(issueReasonCodeFromText("Неверный формат файла", labels)).toEqual({ code: "wrongFormat", custom: false });
    expect(issueReasonCodeFromText(" missing pages ", labels)).toEqual({ code: "missingPages", custom: false });
    expect(issueReasonCodeFromText("Calitate / rezoluție scăzută", labels)).toEqual({ code: "lowQuality", custom: false });
    expect(issueReasonCodeFromText("Другое", labels)).toEqual({ code: "other", custom: false });
  });
  it("free text → other/custom; stored code wins", () => {
    expect(issueReasonCodeFromText("нет обрезки", labels)).toEqual({ code: "other", custom: true });
    expect(issueReasonCodeFromText("нет обрезки", labels, "other")).toEqual({ code: "other", custom: true });
    expect(issueReasonCodeFromText("whatever", labels, "fileCorrupt")).toEqual({ code: "fileCorrupt", custom: false });
    expect(issueReasonCodeFromText(null, labels)).toEqual({ code: "other", custom: false });
  });
});

describe("flagResolveSeconds", () => {
  it("pairs each flag with the next resolution of the same line", () => {
    expect(
      flagResolveSeconds([
        { lineId: "a", at: 0, kind: "flagged" },
        { lineId: "b", at: 1000, kind: "flagged" },
        { lineId: "a", at: 60_000, kind: "replaced" },
        { lineId: "a", at: 70_000, kind: "fixed" }, // no open flag
        { lineId: "a", at: 100_000, kind: "flagged" },
        { lineId: "a", at: 160_000, kind: "cleared" },
      ]),
    ).toEqual([60, 60]);
  });
});

describe("misc", () => {
  it("analyticsSectionKey splits UV-DTF", () => {
    expect(analyticsSectionKey("uv_print", "transfer")).toBe("uv_dtf");
    expect(analyticsSectionKey("uv_print", null)).toBe("uv_print");
    expect(analyticsSectionKey("dtf_apparel")).toBe("dtf_apparel");
  });
  it("formatDurationSec", () => {
    const u = { d: "д", h: "ч", m: "мин" };
    expect(formatDurationSec(null, u)).toBe("—");
    expect(formatDurationSec(20, u)).toBe("<1 мин");
    expect(formatDurationSec(12 * 60, u)).toBe("12 мин");
    expect(formatDurationSec(2 * 3600 + 15 * 60, u)).toBe("2 ч 15 мин");
    expect(formatDurationSec(3 * 86400 + 4 * 3600, u)).toBe("3 д 4 ч");
    expect(formatDurationSec(86400, u)).toBe("1 д");
  });
});
