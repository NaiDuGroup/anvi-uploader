import { describe, expect, it } from "vitest";
import {
  canDealerModifyOrder,
  DEALER_EDITABLE_STATUSES,
  DEALER_FINISHED_STATUSES,
  DEALER_LOCKED_PRINTING_STATUSES,
  dealerModifyBlockReason,
  dealerOrderActionsState,
} from "@/lib/dealerOrderModify";
import {
  dealerOrderCancelSchema,
  dealerOrderUpdateSchema,
  getCabinetVisibleStatus,
  ORDER_STATUSES,
} from "@/lib/validations";

const base = { isPaid: false, deletedAt: null, cancelledAt: null, source: "studio" };

describe("canDealerModifyOrder: every order status", () => {
  const expected: Record<(typeof ORDER_STATUSES)[number], { can: boolean; state: string; block: string | null }> = {
    NEW: { can: true, state: "editable", block: null },
    IN_PROGRESS: { can: true, state: "editable", block: null },
    SENT_TO_WORKSHOP: { can: true, state: "editable", block: null },
    ISSUE: { can: true, state: "editable", block: null },
    WORKSHOP_PRINTING: { can: false, state: "locked", block: "printing" },
    WORKSHOP_READY: { can: false, state: "hidden", block: "finished" },
    READY_IN_STUDIO: { can: false, state: "hidden", block: "finished" },
    RETURNED_TO_STUDIO: { can: false, state: "hidden", block: "finished" },
    DELIVERED: { can: false, state: "hidden", block: "finished" },
  };

  it("covers every status of ORDER_STATUSES (a new status must be classified)", () => {
    expect(Object.keys(expected).sort()).toEqual([...ORDER_STATUSES].sort());
    const classified = [
      ...DEALER_EDITABLE_STATUSES,
      ...DEALER_LOCKED_PRINTING_STATUSES,
      ...DEALER_FINISHED_STATUSES,
    ].sort();
    expect(classified).toEqual([...ORDER_STATUSES].sort());
  });

  for (const status of ORDER_STATUSES) {
    it(`${status}: ${expected[status].can ? "editable" : `locked (${expected[status].block})`}`, () => {
      const order = { ...base, status };
      expect(canDealerModifyOrder(order)).toBe(expected[status].can);
      expect(dealerModifyBlockReason(order)).toBe(expected[status].block);
      expect(dealerOrderActionsState(order)).toBe(expected[status].state);
    });
  }

  it("an unknown status is locked, never editable", () => {
    const order = { ...base, status: "SOMETHING_NEW" };
    expect(canDealerModifyOrder(order)).toBe(false);
    expect(dealerModifyBlockReason(order)).toBe("unknown_status");
    expect(dealerOrderActionsState(order)).toBe("locked");
  });
});

describe("canDealerModifyOrder: paid, deleted, cancelled, storefront", () => {
  it("a paid order is locked in every editable status (plaque, disabled buttons)", () => {
    for (const status of DEALER_EDITABLE_STATUSES) {
      const order = { ...base, status, isPaid: true };
      expect(canDealerModifyOrder(order)).toBe(false);
      expect(dealerModifyBlockReason(order)).toBe("paid");
      expect(dealerOrderActionsState(order)).toBe("locked");
    }
  });

  it("a paid order that is ready stays hidden (finished wins over paid)", () => {
    const order = { ...base, status: "DELIVERED", isPaid: true };
    expect(dealerModifyBlockReason(order)).toBe("finished");
    expect(dealerOrderActionsState(order)).toBe("hidden");
  });

  it("a staff-deleted order is locked and hidden", () => {
    const order = { ...base, status: "SENT_TO_WORKSHOP", deletedAt: new Date() };
    expect(canDealerModifyOrder(order)).toBe(false);
    expect(dealerModifyBlockReason(order)).toBe("deleted");
    expect(dealerOrderActionsState(order)).toBe("hidden");
  });

  it("a cancelled order is locked and hidden (cancel wins over deleted)", () => {
    const now = new Date().toISOString();
    const order = { ...base, status: "SENT_TO_WORKSHOP", deletedAt: now, cancelledAt: now };
    expect(canDealerModifyOrder(order)).toBe(false);
    expect(dealerModifyBlockReason(order)).toBe("cancelled");
    expect(dealerOrderActionsState(order)).toBe("hidden");
  });

  it("a storefront order is never dealer-editable", () => {
    const order = { ...base, status: "NEW", source: "shop" };
    expect(canDealerModifyOrder(order)).toBe(false);
    expect(dealerModifyBlockReason(order)).toBe("shop");
  });
});

describe("getCabinetVisibleStatus", () => {
  it("is «cancelled» whenever cancelledAt is set, whatever the status", () => {
    expect(getCabinetVisibleStatus({ status: "SENT_TO_WORKSHOP", cancelledAt: new Date() })).toBe("cancelled");
    expect(getCabinetVisibleStatus({ status: "ISSUE", cancelledAt: "2026-11-05T10:00:00Z" })).toBe("cancelled");
  });
  it("falls back to the client-visible status", () => {
    expect(getCabinetVisibleStatus({ status: "SENT_TO_WORKSHOP", cancelledAt: null })).toBe("inProgress");
    expect(getCabinetVisibleStatus({ status: "DELIVERED" })).toBe("ready");
  });
});

describe("dealerOrderUpdateSchema", () => {
  const line = {
    productType: "paper_print",
    files: [{ fileName: "a.pdf", fileUrl: "uploads/a.pdf", copies: 2, color: "bw", paperType: "A4" }],
  };

  it("strips injected price, cost, client and tier fields", () => {
    const parsed = dealerOrderUpdateSchema.parse({
      price: 1,
      costMdl: 0,
      clientId: "00000000-0000-4000-8000-000000000000",
      phone: "+37360000000",
      lines: [{ ...line, customerType: "retail", designId: "00000000-0000-4000-8000-000000000001", price: 1, unitCost: 0 }],
    });
    expect(parsed).not.toHaveProperty("price");
    expect(parsed).not.toHaveProperty("costMdl");
    expect(parsed).not.toHaveProperty("clientId");
    expect(parsed).not.toHaveProperty("phone");
    expect(parsed.lines[0]).not.toHaveProperty("customerType");
    expect(parsed.lines[0]).not.toHaveProperty("designId");
    expect(parsed.lines[0]).not.toHaveProperty("price");
    expect(parsed.lines[0]).not.toHaveProperty("unitCost");
  });

  it("accepts existing files by id and requires at least one line", () => {
    expect(
      dealerOrderUpdateSchema.safeParse({
        lines: [{ productType: "paper_print", files: [{ fileId: "00000000-0000-4000-8000-000000000002", copies: 3 }] }],
      }).success,
    ).toBe(true);
    expect(dealerOrderUpdateSchema.safeParse({ lines: [] }).success).toBe(false);
  });
});

describe("dealerOrderCancelSchema", () => {
  it("requires a reason of at least 3 characters (trimmed)", () => {
    expect(dealerOrderCancelSchema.safeParse({}).success).toBe(false);
    expect(dealerOrderCancelSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(dealerOrderCancelSchema.safeParse({ reason: "   " }).success).toBe(false);
    expect(dealerOrderCancelSchema.safeParse({ reason: " ab " }).success).toBe(false);
    expect(dealerOrderCancelSchema.parse({ reason: "  не тот файл " }).reason).toBe("не тот файл");
  });
  it("caps the reason at 500 characters", () => {
    expect(dealerOrderCancelSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
    expect(dealerOrderCancelSchema.safeParse({ reason: "x".repeat(500) }).success).toBe(true);
  });
});
