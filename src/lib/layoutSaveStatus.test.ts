import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "@/lib/validations";
import { canDealerModifyOrder } from "@/lib/dealerOrderModify";
import { layoutSaveStatusChange } from "@/lib/layoutSaveStatus";

const EXPECTED: Record<(typeof ORDER_STATUSES)[number], "reset" | "keep"> = {
  NEW: "reset",
  IN_PROGRESS: "reset",
  READY_IN_STUDIO: "keep",
  SENT_TO_WORKSHOP: "reset",
  WORKSHOP_PRINTING: "keep",
  WORKSHOP_READY: "keep",
  RETURNED_TO_STUDIO: "keep",
  DELIVERED: "keep",
  ISSUE: "reset",
};

describe("layoutSaveStatusChange", () => {
  it.each(ORDER_STATUSES.map((s) => [s]))("%s", (status) => {
    const r = layoutSaveStatusChange(status);
    if (EXPECTED[status] === "reset") {
      expect(r.orderData).toEqual({ status: "IN_PROGRESS", approvalFeedback: null });
      expect(r.log).toEqual(status === "IN_PROGRESS" ? null : { oldValue: status, newValue: "IN_PROGRESS" });
    } else {
      expect(r.orderData).toEqual({});
      expect(r.log).toBeNull();
    }
  });

  it("never makes a dealer-locked order dealer-editable again", () => {
    for (const status of ORDER_STATUSES) {
      const before = { status, isPaid: false };
      const after = { status: layoutSaveStatusChange(status).orderData.status ?? status, isPaid: false };
      if (!canDealerModifyOrder(before)) expect(canDealerModifyOrder(after)).toBe(false);
    }
  });

  it("unknown status is left alone", () => {
    expect(layoutSaveStatusChange("CANCELLED")).toEqual({ orderData: {}, log: null });
  });
});
