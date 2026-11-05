import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "@/lib/validations";
import { LINE_PRODUCTION_STATUSES } from "@/lib/orderLineProductionStatus";
import { WORKSHOP_PHASE_STATUSES } from "@/lib/orderStatusFromLines";
import {
  CLEARED_LAYOUT_ISSUE_FIELDS,
  LAYOUT_FIXED_HIGHLIGHT_MS,
  LAYOUT_ISSUE_ARCHIVE_REASON,
  LAYOUT_ISSUE_NOTE_MAX,
  LAYOUT_ISSUE_REASONS,
  canFlagLayoutIssue,
  isLayoutIssueReason,
  isLayoutRecentlyFixed,
  isLineHeldForLayout,
  isLineNeedsLayout,
  layoutAttentionRank,
  layoutIssueWaitHours,
  layoutIssueWaitParts,
  normalizeLayoutIssueNote,
  toLayoutIssueView,
} from "@/lib/layoutIssue";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("reasons and constants", () => {
  it("lists the order-level ISSUE reasons plus wrongSize", () => {
    expect([...LAYOUT_ISSUE_REASONS]).toEqual([
      "fileCorrupt",
      "wrongFormat",
      "lowQuality",
      "missingPages",
      "wrongSize",
      "other",
    ]);
    expect(LAYOUT_ISSUE_NOTE_MAX).toBe(500);
    expect(LAYOUT_ISSUE_ARCHIVE_REASON).toBe("layout_issue");
    expect(LAYOUT_FIXED_HIGHLIGHT_MS).toBe(24 * HOUR);
  });

  it("isLayoutIssueReason accepts only the known codes", () => {
    for (const r of LAYOUT_ISSUE_REASONS) expect(isLayoutIssueReason(r)).toBe(true);
    for (const v of ["", "FILECORRUPT", "wrong_size", "issue", null, undefined, 1, {}, ["other"]]) {
      expect(isLayoutIssueReason(v)).toBe(false);
    }
  });

  it("cleared fields null every issue detail but not layoutFixedAt", () => {
    expect(CLEARED_LAYOUT_ISSUE_FIELDS).toEqual({
      layoutIssueReason: null,
      layoutIssueNote: null,
      layoutIssueAt: null,
      layoutIssueById: null,
    });
    expect("layoutFixedAt" in CLEARED_LAYOUT_ISSUE_FIELDS).toBe(false);
  });
});

describe("isLineNeedsLayout / isLineHeldForLayout", () => {
  it("only NEEDS_LAYOUT", () => {
    expect(LINE_PRODUCTION_STATUSES.filter((s) => isLineNeedsLayout(s))).toEqual(["NEEDS_LAYOUT"]);
    expect(isLineNeedsLayout(null)).toBe(false);
    expect(isLineNeedsLayout(undefined)).toBe(false);
    expect(isLineNeedsLayout("needs_layout")).toBe(false);
  });

  it("held reads lineStatus first, then productionStatus", () => {
    expect(isLineHeldForLayout({ lineStatus: "NEEDS_LAYOUT" })).toBe(true);
    expect(isLineHeldForLayout({ productionStatus: "NEEDS_LAYOUT" })).toBe(true);
    expect(isLineHeldForLayout({ lineStatus: "WAITING", productionStatus: "NEEDS_LAYOUT" })).toBe(false);
    expect(isLineHeldForLayout({ lineStatus: null, productionStatus: "NEEDS_LAYOUT" })).toBe(true);
    expect(isLineHeldForLayout({})).toBe(false);
    expect(isLineHeldForLayout({ lineStatus: "PRINTING" })).toBe(false);
  });
});

describe("canFlagLayoutIssue: every order status × line status", () => {
  for (const orderStatus of ORDER_STATUSES) {
    for (const lineStatus of LINE_PRODUCTION_STATUSES) {
      const inPhase = (WORKSHOP_PHASE_STATUSES as readonly string[]).includes(orderStatus);
      const expected = inPhase && (lineStatus === "WAITING" || lineStatus === "PRINTING");
      it(`${orderStatus} × ${lineStatus} → ${expected}`, () => {
        expect(canFlagLayoutIssue(orderStatus, lineStatus)).toBe(expected);
      });
    }
  }

  it("unknown statuses never allow", () => {
    expect(canFlagLayoutIssue("SENT_TO_WORKSHOP", "BOGUS")).toBe(false);
    expect(canFlagLayoutIssue("BOGUS", "WAITING")).toBe(false);
    expect(canFlagLayoutIssue("ISSUE", "WAITING")).toBe(false);
  });
});

describe("normalizeLayoutIssueNote", () => {
  it("trims and nulls empties", () => {
    expect(normalizeLayoutIssueNote(null)).toBeNull();
    expect(normalizeLayoutIssueNote(undefined)).toBeNull();
    expect(normalizeLayoutIssueNote("")).toBeNull();
    expect(normalizeLayoutIssueNote("   \n\t ")).toBeNull();
    expect(normalizeLayoutIssueNote("  сжат в JPEG  ")).toBe("сжат в JPEG");
    expect(normalizeLayoutIssueNote("a\nb")).toBe("a\nb");
  });

  it("does not truncate (length is the schema's job)", () => {
    const long = "x".repeat(LAYOUT_ISSUE_NOTE_MAX + 10);
    expect(normalizeLayoutIssueNote(long)).toBe(long);
  });
});

describe("layoutIssueWaitHours", () => {
  it("whole hours, floored, never negative", () => {
    expect(layoutIssueWaitHours(null, NOW)).toBe(0);
    expect(layoutIssueWaitHours(undefined, NOW)).toBe(0);
    expect(layoutIssueWaitHours(ago(59 * MIN), NOW)).toBe(0);
    expect(layoutIssueWaitHours(ago(HOUR), NOW)).toBe(1);
    expect(layoutIssueWaitHours(ago(3 * HOUR + 59 * MIN), NOW)).toBe(3);
    expect(layoutIssueWaitHours(ago(-5 * HOUR), NOW)).toBe(0);
    expect(layoutIssueWaitHours(ago(2 * HOUR).toISOString(), NOW)).toBe(2);
    expect(layoutIssueWaitHours("not a date", NOW)).toBe(0);
  });
});

describe("layoutIssueWaitParts", () => {
  it.each([
    [0, { unit: "m", value: 0 }],
    [59_999, { unit: "m", value: 0 }],
    [MIN, { unit: "m", value: 1 }],
    [59 * MIN, { unit: "m", value: 59 }],
    [HOUR, { unit: "h", value: 1 }],
    [47 * HOUR + 59 * MIN, { unit: "h", value: 47 }],
    [48 * HOUR, { unit: "d", value: 2 }],
    [71 * HOUR, { unit: "d", value: 2 }],
    [72 * HOUR, { unit: "d", value: 3 }],
    [30 * 24 * HOUR, { unit: "d", value: 30 }],
  ])("%d ms → %o", (ms, expected) => {
    expect(layoutIssueWaitParts(ago(ms), NOW)).toEqual(expected);
    expect(layoutIssueWaitParts(ago(ms).toISOString(), NOW)).toEqual(expected);
  });

  it("missing, invalid or future → 0 minutes", () => {
    expect(layoutIssueWaitParts(null, NOW)).toEqual({ unit: "m", value: 0 });
    expect(layoutIssueWaitParts(undefined, NOW)).toEqual({ unit: "m", value: 0 });
    expect(layoutIssueWaitParts("garbage", NOW)).toEqual({ unit: "m", value: 0 });
    expect(layoutIssueWaitParts(ago(-3 * HOUR), NOW)).toEqual({ unit: "m", value: 0 });
  });
});

describe("isLayoutRecentlyFixed", () => {
  it("within 24 h of the fix, not flagged again", () => {
    expect(isLayoutRecentlyFixed({ lineStatus: "WAITING", layoutFixedAt: ago(0) }, NOW)).toBe(true);
    expect(isLayoutRecentlyFixed({ lineStatus: "WAITING", layoutFixedAt: ago(23 * HOUR) }, NOW)).toBe(true);
    expect(isLayoutRecentlyFixed({ lineStatus: "PRINTING", layoutFixedAt: ago(HOUR).toISOString() }, NOW)).toBe(true);
    expect(isLayoutRecentlyFixed({ lineStatus: "DONE", layoutFixedAt: ago(HOUR) }, NOW)).toBe(true);
  });

  it("exactly 24 h or older is no longer fresh", () => {
    expect(isLayoutRecentlyFixed({ lineStatus: "WAITING", layoutFixedAt: ago(LAYOUT_FIXED_HIGHLIGHT_MS) }, NOW)).toBe(false);
    expect(isLayoutRecentlyFixed({ lineStatus: "WAITING", layoutFixedAt: ago(LAYOUT_FIXED_HIGHLIGHT_MS - 1) }, NOW)).toBe(true);
    expect(isLayoutRecentlyFixed({ lineStatus: "WAITING", layoutFixedAt: ago(3 * 24 * HOUR) }, NOW)).toBe(false);
  });

  it("no fix, invalid date or flagged again → false", () => {
    expect(isLayoutRecentlyFixed({ lineStatus: "WAITING" }, NOW)).toBe(false);
    expect(isLayoutRecentlyFixed({ lineStatus: "WAITING", layoutFixedAt: null }, NOW)).toBe(false);
    expect(isLayoutRecentlyFixed({ lineStatus: "WAITING", layoutFixedAt: "nope" }, NOW)).toBe(false);
    expect(isLayoutRecentlyFixed({ lineStatus: "NEEDS_LAYOUT", layoutFixedAt: ago(MIN) }, NOW)).toBe(false);
  });
});

describe("layoutAttentionRank", () => {
  it("flagged 0, freshly fixed 1, the rest 2", () => {
    expect(layoutAttentionRank({ lineStatus: "NEEDS_LAYOUT" }, NOW)).toBe(0);
    expect(layoutAttentionRank({ lineStatus: "NEEDS_LAYOUT", layoutFixedAt: ago(MIN) }, NOW)).toBe(0);
    expect(layoutAttentionRank({ lineStatus: "WAITING", layoutFixedAt: ago(MIN) }, NOW)).toBe(1);
    expect(layoutAttentionRank({ lineStatus: "WAITING", layoutFixedAt: ago(25 * HOUR) }, NOW)).toBe(2);
    expect(layoutAttentionRank({ lineStatus: "WAITING" }, NOW)).toBe(2);
    expect(layoutAttentionRank({ lineStatus: "DONE" }, NOW)).toBe(2);
    expect(layoutAttentionRank({}, NOW)).toBe(2);
  });
});

describe("toLayoutIssueView", () => {
  it("null unless the line is flagged", () => {
    for (const s of ["WAITING", "PRINTING", "DONE", null, undefined]) {
      expect(
        toLayoutIssueView({ productionStatus: s, layoutIssueReason: "lowQuality", layoutIssueAt: NOW }),
      ).toBeNull();
    }
  });

  it("reason, note and ISO since; no staff id leaks", () => {
    const view = toLayoutIssueView({
      productionStatus: "NEEDS_LAYOUT",
      layoutIssueReason: "wrongSize",
      layoutIssueNote: "нужно 90×50",
      layoutIssueAt: NOW,
      ...({ layoutIssueById: "staff-1" } as object),
    });
    expect(view).toEqual({ reason: "wrongSize", note: "нужно 90×50", since: NOW.toISOString() });
    expect(Object.keys(view!)).toEqual(["reason", "note", "since"]);
  });

  it("string dates pass through; missing details become null", () => {
    expect(toLayoutIssueView({ productionStatus: "NEEDS_LAYOUT", layoutIssueAt: "2026-11-01T10:00:00.000Z" })).toEqual({
      reason: null,
      note: null,
      since: "2026-11-01T10:00:00.000Z",
    });
    expect(toLayoutIssueView({ productionStatus: "NEEDS_LAYOUT", layoutIssueAt: null })).toEqual({
      reason: null,
      note: null,
      since: null,
    });
  });
});
