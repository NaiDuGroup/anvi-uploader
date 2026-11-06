import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ru } from "@/lib/i18n/ru";
import { ro } from "@/lib/i18n/ro";
import { en } from "@/lib/i18n/en";
import { describeEntry, type HistoryEntry } from "./HistoryPanel";
import { DealerUrgencyBadge, DealerUrgencyWaiveContext, dealerUrgencyBadgeText } from "./DealerUrgencyBadge";

const entry = (action: string, metadata: Record<string, unknown>): HistoryEntry => ({
  id: "1",
  action,
  field: "isPrio",
  oldValue: null,
  newValue: null,
  metadata,
  createdAt: new Date().toISOString(),
  userName: "x",
  userRole: "admin",
});

describe("dealer urgency texts", () => {
  it("badge: fee / free / waived", () => {
    expect(dealerUrgencyBadgeText({ feeMdl: 50, waived: false }, ru)).toBe("срочно по заявке дилера · +50 лей");
    expect(dealerUrgencyBadgeText({ feeMdl: 0, waived: false }, ru)).toBe("срочно по заявке дилера · бесплатно");
    expect(dealerUrgencyBadgeText({ feeMdl: 0, waived: true }, ru)).toBe("срочно по заявке дилера · доплата снята");
    expect(dealerUrgencyBadgeText({ feeMdl: 12.5, waived: false }, ro)).toBe("urgent la cererea dealerului · +12.50 lei");
    expect(dealerUrgencyBadgeText({ feeMdl: 50, waived: false }, en)).toContain("rush requested by dealer");
  });

  it("history entries", () => {
    expect(describeEntry(entry("urgency_dealer_on", { feeMdl: 50 }), ru)).toBe("Дилер включил срочность (+50 лей)");
    expect(describeEntry(entry("urgency_dealer_on", { feeMdl: 0 }), ru)).toBe("Дилер включил срочность (бесплатно)");
    expect(describeEntry(entry("urgency_dealer_off", { feeMdl: 50 }), ru)).toBe("Дилер снял срочность (+50 лей)");
    expect(describeEntry(entry("urgency_fee_waived", { feeMdl: 50 }), ru)).toBe(
      "Сотрудник снял доплату за срочность (50 лей)",
    );
    expect(describeEntry(entry("urgency_staff_off", { feeMdl: 50 }), ru)).toContain("Сотрудник снял срочность");
  });

  it("every locale has every key (no empty strings)", () => {
    for (const dict of [ru, ro, en]) {
      for (const [k, v] of Object.entries(dict.dealerUrgency)) {
        if (typeof v === "string") expect(v.length, k).toBeGreaterThan(0);
        else expect(typeof v, k).toBe("function");
      }
    }
  });
});

describe("DealerUrgencyBadge waive control", () => {
  const render = (canWaive: boolean, props: Partial<Parameters<typeof DealerUrgencyBadge>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(
        DealerUrgencyWaiveContext.Provider,
        { value: { canWaive } },
        createElement(DealerUrgencyBadge, {
          orderId: "o1",
          urgency: { feeMdl: 50, waived: false },
          t: ru,
          ...props,
        }),
      ),
    );

  it("admin + unpaid + fee > 0 → «Снять доплату»", () => {
    expect(render(true)).toContain('data-testid="dealer-urgency-waive"');
  });
  it("hidden for non-admins, paid orders, zero / waived fees and the board", () => {
    expect(render(false)).not.toContain("dealer-urgency-waive");
    expect(render(true, { isPaid: true })).not.toContain("dealer-urgency-waive");
    expect(render(true, { urgency: { feeMdl: 0, waived: false } })).not.toContain("dealer-urgency-waive");
    expect(render(true, { urgency: { feeMdl: 0, waived: true } })).not.toContain("dealer-urgency-waive");
    expect(render(true, { allowWaive: false })).not.toContain("dealer-urgency-waive");
  });
});
