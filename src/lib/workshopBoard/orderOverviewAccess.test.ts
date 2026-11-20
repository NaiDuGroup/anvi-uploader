import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "@/lib/orderHistoryFormat";
import {
  canEditOrderFromOverview,
  canOpenOrderOverview,
  canSeeOrderMoney,
  canViewOrderInOverview,
  historyForRole,
  orderLinesOnBoard,
  ordersListSearchHref,
} from "./orderOverviewAccess";
import type { WorkshopBoardSection } from "./types";

function entry(over: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: Math.random().toString(36).slice(2),
    action: "field_updated",
    field: null,
    oldValue: null,
    newValue: null,
    metadata: null,
    createdAt: "2026-11-20T10:00:00.000Z",
    userName: "Ana",
    userRole: "admin",
    ...over,
  };
}

describe("order overview access", () => {
  it("opens for the board roles only", () => {
    expect(canOpenOrderOverview("workshop")).toBe(true);
    expect(canOpenOrderOverview("superadmin")).toBe(true);
    for (const role of ["admin", "customer", "viewer", "dealer", ""]) {
      expect(canOpenOrderOverview(role)).toBe(false);
    }
  });

  it("workshop sees workshop orders only; super admin any", () => {
    expect(canViewOrderInOverview("workshop", { isWorkshop: true })).toBe(true);
    expect(canViewOrderInOverview("workshop", { isWorkshop: false })).toBe(false);
    expect(canViewOrderInOverview("superadmin", { isWorkshop: false })).toBe(true);
    expect(canViewOrderInOverview("customer", { isWorkshop: true })).toBe(false);
  });

  it("money for super admin / admin, never the workshop", () => {
    expect(canSeeOrderMoney("superadmin")).toBe(true);
    expect(canSeeOrderMoney("admin")).toBe(true);
    expect(canSeeOrderMoney("workshop")).toBe(false);
    expect(canSeeOrderMoney("customer")).toBe(false);
  });

  it("edit: staff, not storefront orders", () => {
    expect(canEditOrderFromOverview("workshop", "studio")).toBe(true);
    expect(canEditOrderFromOverview("superadmin", "cabinet")).toBe(true);
    expect(canEditOrderFromOverview("superadmin", "shop")).toBe(false);
    expect(canEditOrderFromOverview("customer", "studio")).toBe(false);
  });

  it("orders list link searches by the order number", () => {
    expect(ordersListSearchHref(10389)).toBe("/admin/orders?q=10389");
  });
});

describe("historyForRole", () => {
  const entries: HistoryEntry[] = [
    entry({ action: "field_updated", field: "price", oldValue: "100", newValue: "120" }),
    entry({ action: "field_updated", field: "isPaid", oldValue: "false", newValue: "true" }),
    entry({ action: "payment_mismatch", metadata: { paidMdl: 50, totalMdl: 120 } }),
    entry({ action: "urgency_fee_waived", metadata: { feeMdl: 50 } }),
    entry({ action: "dealer_edited", oldValue: "100", newValue: "150", metadata: { notesChanged: true } }),
    entry({
      action: "field_updated",
      field: "order_structure",
      metadata: {
        changes: [
          { kind: "price", from: 100, to: 120 },
          { kind: "line_qty", name: "Кружка", type: "mug", from: 10, to: 12 },
        ],
        totalMdl: 120,
      },
    }),
    entry({ action: "status_changed", oldValue: "SENT_TO_WORKSHOP", newValue: "WORKSHOP_PRINTING" }),
  ];

  it("keeps everything for super admin", () => {
    expect(historyForRole(entries, "superadmin")).toHaveLength(entries.length);
  });

  it("drops prices and payments for the workshop", () => {
    const out = historyForRole(entries, "workshop");
    expect(out.map((e) => e.action)).toEqual(["dealer_edited", "field_updated", "status_changed"]);
    const dealer = out[0]!;
    expect(dealer.oldValue).toBeNull();
    expect(dealer.newValue).toBeNull();
    expect(dealer.metadata).toEqual({ notesChanged: true });
    const structure = out[1]!;
    expect(structure.metadata).toEqual({
      changes: [{ kind: "line_qty", name: "Кружка", type: "mug", from: 10, to: 12 }],
    });
    expect(out[2]!.newValue).toBe("WORKSHOP_PRINTING");
    expect(JSON.stringify(out)).not.toMatch(/120|150|"price"/);
  });
});

describe("orderLinesOnBoard", () => {
  it("collects this order's line ids across sections", () => {
    const line = (orderId: string, orderLineId: string) => ({ orderId, orderLineId });
    const sections = [
      { groups: [{ lines: [line("a", "a1"), line("b", "b1")] }] },
      { groups: [{ lines: [line("a", "a3")] }, { lines: [] }] },
    ] as unknown as WorkshopBoardSection[];
    expect([...orderLinesOnBoard(sections, "a")].sort()).toEqual(["a1", "a3"]);
    expect(orderLinesOnBoard(sections, "z").size).toBe(0);
  });
});
