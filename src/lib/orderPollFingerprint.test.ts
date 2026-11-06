import { describe, expect, it } from "vitest";
import { orderPollFingerprint, type PollFingerprintOrder } from "./orderPollFingerprint";

const base = (lines: Array<[string, string]>): PollFingerprintOrder => ({
  id: "o1",
  status: "WORKSHOP_PRINTING",
  isPrio: false,
  assignedTo: "u1",
  isWorkshop: true,
  commentCount: 0,
  unreadCommentCount: 0,
  notes: null,
  issueReason: null,
  price: 650,
  isPaid: false,
  clientId: "c1",
  orderLines: lines.map(([id, productionStatus]) => ({ id, productionStatus })),
});

describe("orderPollFingerprint", () => {
  it("changes when one line turns DONE while the order status stays the same", () => {
    const before = base([["l1", "PRINTING"], ["l2", "WAITING"]]);
    const after = base([["l1", "DONE"], ["l2", "WAITING"]]);
    expect(before.status).toBe(after.status);
    expect(orderPollFingerprint([before])).not.toBe(orderPollFingerprint([after]));
  });

  it("is stable for identical data", () => {
    const a = base([["l1", "PRINTING"]]);
    const b = base([["l1", "PRINTING"]]);
    expect(orderPollFingerprint([a])).toBe(orderPollFingerprint([b]));
  });

  it("changes when the order status changes", () => {
    const a = base([["l1", "DONE"]]);
    const b = { ...base([["l1", "DONE"]]), status: "WORKSHOP_READY" };
    expect(orderPollFingerprint([a])).not.toBe(orderPollFingerprint([b]));
  });

  it("tolerates orders without lines", () => {
    const a = { ...base([]), orderLines: undefined };
    expect(() => orderPollFingerprint([a])).not.toThrow();
  });

  it("changes on a «Нужен макет» flag, and again on a flag + fix between two polls (status WAITING both times)", () => {
    const waiting = base([["l1", "WAITING"]]);
    const flagged: PollFingerprintOrder = {
      ...waiting,
      orderLines: [{ id: "l1", productionStatus: "NEEDS_LAYOUT", layoutIssueAt: "2026-11-06T10:00:00.000Z" }],
    };
    const fixed: PollFingerprintOrder = {
      ...waiting,
      orderLines: [{ id: "l1", productionStatus: "WAITING", layoutIssueAt: null, layoutFixedAt: "2026-11-06T10:05:00.000Z" }],
    };
    expect(orderPollFingerprint([flagged])).not.toBe(orderPollFingerprint([waiting]));
    expect(orderPollFingerprint([fixed])).not.toBe(orderPollFingerprint([waiting]));
    expect(orderPollFingerprint([fixed])).not.toBe(orderPollFingerprint([flagged]));
    // A second fix of the same line (new layoutFixedAt) is visible too.
    const fixedAgain: PollFingerprintOrder = {
      ...fixed,
      orderLines: [{ id: "l1", productionStatus: "WAITING", layoutIssueAt: null, layoutFixedAt: "2026-11-06T11:00:00.000Z" }],
    };
    expect(orderPollFingerprint([fixedAgain])).not.toBe(orderPollFingerprint([fixed]));
  });

  it("changes when the owner replaces a WAITING line's file (status stays WAITING), and on a second replace", () => {
    const waiting = base([["l1", "PRINTING"], ["l2", "WAITING"]]);
    const replaced: PollFingerprintOrder = {
      ...waiting,
      orderLines: [
        { id: "l1", productionStatus: "PRINTING" },
        { id: "l2", productionStatus: "WAITING", ownerReplacedAt: "2026-11-06T12:20:00.000Z" },
      ],
    };
    const replacedAgain: PollFingerprintOrder = {
      ...waiting,
      orderLines: [
        { id: "l1", productionStatus: "PRINTING" },
        { id: "l2", productionStatus: "WAITING", ownerReplacedAt: "2026-11-06T12:25:00.000Z" },
      ],
    };
    expect(replaced.status).toBe(waiting.status);
    expect(orderPollFingerprint([replaced])).not.toBe(orderPollFingerprint([waiting]));
    expect(orderPollFingerprint([replacedAgain])).not.toBe(orderPollFingerprint([replaced]));
    // Same marker → same fingerprint (no spurious refresh).
    expect(orderPollFingerprint([{ ...replaced }])).toBe(orderPollFingerprint([replaced]));
  });

  it("an owner replace is distinguishable from a layout fix at the same moment", () => {
    const at = "2026-11-06T12:20:00.000Z";
    const fixed = { ...base([]), orderLines: [{ id: "l1", productionStatus: "WAITING", layoutFixedAt: at }] };
    const replaced = { ...base([]), orderLines: [{ id: "l1", productionStatus: "WAITING", ownerReplacedAt: at }] };
    expect(orderPollFingerprint([fixed])).not.toBe(orderPollFingerprint([replaced]));
  });
});
