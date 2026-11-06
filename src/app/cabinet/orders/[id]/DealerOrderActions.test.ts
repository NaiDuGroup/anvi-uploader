import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ru } from "@/lib/i18n/ru";
import { dealerModifyBlockReason, dealerOrderActionsState } from "@/lib/dealerOrderModify";
import { ORDER_STATUSES } from "@/lib/validations";
import { DealerOrderActionsView } from "./DealerOrderActions";

/**
 * Server-rendered markup of the dealer's edit / cancel bar for each order
 * state (no DOM test setup in this repo: `renderToStaticMarkup` in node).
 */
function render(
  status: string,
  extra: {
    isPaid?: boolean;
    cancelledAt?: string | null;
    orderLines?: { productionStatus: string }[];
    waitingFilesReplaceable?: boolean;
  } = {},
) {
  const order = {
    status,
    isPaid: extra.isPaid ?? false,
    cancelledAt: extra.cancelledAt ?? null,
    orderLines: extra.orderLines,
  };
  return renderToStaticMarkup(
    createElement(DealerOrderActionsView, {
      orderId: "order-1",
      state: dealerOrderActionsState(order),
      lockReason: dealerModifyBlockReason(order),
      waitingFilesReplaceable: extra.waitingFilesReplaceable,
      t: ru,
      onCancelClick: vi.fn(),
      onWriteWorkshop: vi.fn(),
    }),
  );
}

/** The opening tag of the element carrying `data-testid`. */
function tagOf(html: string, testId: string): string {
  const at = html.indexOf(`data-testid="${testId}"`);
  if (at < 0) return "";
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf(">", at) + 1);
}

describe("DealerOrderActionsView", () => {
  it("editable order: active «Изменить» link to the wizard and «Отменить заказ», no plaque", () => {
    const html = render("SENT_TO_WORKSHOP");
    expect(html).toContain('data-state="editable"');
    expect(tagOf(html, "dealer-order-edit")).toContain('href="/cabinet/orders/order-1/edit"');
    expect(tagOf(html, "dealer-order-cancel")).not.toContain("disabled");
    expect(html).toContain("Изменить");
    expect(html).toContain("Отменить заказ");
    expect(html).not.toContain('data-testid="dealer-order-locked"');
    expect(html).not.toContain("Написать цеху");
    // The «можно изменить» hint lives under the order status, not in the bar.
    expect(html).not.toContain("Пока можно изменить или отменить");
  });

  it("printing: both buttons visible but disabled and «Написать цеху», no plaque", () => {
    const html = render("WORKSHOP_PRINTING");
    expect(html).toContain('data-state="locked"');
    const edit = tagOf(html, "dealer-order-edit");
    const cancel = tagOf(html, "dealer-order-cancel");
    expect(edit).toMatch(/^<button/);
    expect(edit).toContain("disabled");
    expect(edit).not.toContain("href=");
    expect(cancel).toContain("disabled");
    // «Изменить уже нельзя…» is shown under the status (cabinetStatusHint), not repeated here.
    expect(html).not.toContain('data-testid="dealer-order-locked"');
    expect(html).not.toContain("Изменить уже нельзя");
    expect(tagOf(html, "dealer-order-write-workshop")).not.toContain("disabled");
    expect(html).toContain("Написать цеху");
  });

  it("paid order: disabled buttons with the «already paid» plaque", () => {
    const html = render("SENT_TO_WORKSHOP", { isPaid: true });
    expect(html).toContain('data-state="locked"');
    expect(tagOf(html, "dealer-order-cancel")).toContain("disabled");
    expect(html).toContain('data-testid="dealer-order-locked"');
    expect(html).toContain("Заказ уже оплачен");
  });

  it.each(["WORKSHOP_READY", "READY_IN_STUDIO", "RETURNED_TO_STUDIO", "DELIVERED"])(
    "%s: nothing rendered (only the chat stays)",
    (status) => {
      expect(render(status)).toBe("");
    },
  );

  it("cancelled order: nothing rendered", () => {
    expect(render("SENT_TO_WORKSHOP", { cancelledAt: "2026-11-05T10:00:00Z" })).toBe("");
  });

  it("every status renders one of the three states", () => {
    for (const status of ORDER_STATUSES) {
      const html = render(status);
      expect(html === "" || /data-state="(editable|locked)"/.test(html)).toBe(true);
    }
  });

  it("buttons stack full-width on phones and sit inline from sm up", () => {
    const html = render("WORKSHOP_PRINTING");
    expect(html).toContain("flex-col gap-2 sm:flex-row");
    expect(tagOf(html, "dealer-order-write-workshop")).toContain("w-full");
    expect(tagOf(html, "dealer-order-write-workshop")).toContain("sm:w-auto");
  });

  describe("step 4: locked plaque mentions replaceable waiting files", () => {
    const mixed = [{ productionStatus: "PRINTING" }, { productionStatus: "DONE" }, { productionStatus: "WAITING" }];

    it("printing (a line started) + a waiting position: plaque with the files hint, buttons still disabled", () => {
      const html = render("WORKSHOP_PRINTING", { orderLines: mixed, waitingFilesReplaceable: true });
      expect(html).toContain('data-state="locked"');
      expect(html).toContain('data-testid="dealer-order-locked"');
      expect(html).toContain('data-testid="dealer-order-locked-files-hint"');
      expect(html).toContain(ru.layoutIssue.lockedWaitingFilesHint);
      expect(tagOf(html, "dealer-order-edit")).toContain("disabled");
      expect(tagOf(html, "dealer-order-cancel")).toContain("disabled");
      // Printing is explained under the status, not repeated here.
      expect(html).not.toContain(ru.dealerOrder.lockedPrinting);
    });

    it("SENT_TO_WORKSHOP with one DONE line (status not yet derived) is locked and shows the hint", () => {
      const html = render("SENT_TO_WORKSHOP", {
        orderLines: [{ productionStatus: "DONE" }, { productionStatus: "WAITING" }],
        waitingFilesReplaceable: true,
      });
      expect(html).toContain('data-state="locked"');
      expect(html).toContain('data-testid="dealer-order-locked-files-hint"');
    });

    it("printing with nothing waiting: no plaque (as before)", () => {
      const html = render("WORKSHOP_PRINTING", {
        orderLines: [{ productionStatus: "PRINTING" }, { productionStatus: "DONE" }],
        waitingFilesReplaceable: false,
      });
      expect(html).not.toContain('data-testid="dealer-order-locked"');
      expect(html).not.toContain("dealer-order-locked-files-hint");
    });

    it("paid + waiting position: the paid text and the files hint", () => {
      const html = render("SENT_TO_WORKSHOP", { isPaid: true, waitingFilesReplaceable: true });
      expect(html).toContain(ru.dealerOrder.lockedPaid);
      expect(html).toContain('data-testid="dealer-order-locked-files-hint"');
    });

    it("paid without the flag: the paid text only", () => {
      const html = render("SENT_TO_WORKSHOP", { isPaid: true });
      expect(html).toContain(ru.dealerOrder.lockedPaid);
      expect(html).not.toContain("dealer-order-locked-files-hint");
    });

    it("editable order: never a plaque, even with the flag", () => {
      const html = render("SENT_TO_WORKSHOP", { waitingFilesReplaceable: true });
      expect(html).toContain('data-state="editable"');
      expect(html).not.toContain('data-testid="dealer-order-locked"');
    });

    it("finished order: nothing rendered", () => {
      expect(render("WORKSHOP_READY", { waitingFilesReplaceable: true })).toBe("");
    });
  });
});
