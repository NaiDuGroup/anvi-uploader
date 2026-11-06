import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "@/lib/validations";
import { LINE_PRODUCTION_STATUSES } from "@/lib/orderLineProductionStatus";
import { canDealerModifyOrder } from "@/lib/dealerOrderModify";
import { layoutIssueRu } from "@/lib/i18n/layoutIssue/ru";
import { layoutIssueRo } from "@/lib/i18n/layoutIssue/ro";
import { layoutIssueEn } from "@/lib/i18n/layoutIssue/en";
import {
  cabinetLinePill,
  cabinetLinesDoneSummary,
  canOwnerReplaceLineFile,
  isOwnerReplaceMarkerVisible,
  OWNER_REPLACE_ARCHIVE_REASON,
  OWNER_REPLACE_ORDER_STATUSES,
  ownerLineFileBlockReason,
} from "./ownerLineFileReplace";

const ALLOWED = new Set<string>(["NEW", "IN_PROGRESS", "ISSUE", "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY"]);
const LINE_STATUSES = ["WAITING", "NEEDS_LAYOUT", "PRINTING", "DONE", "SOMETHING_NEW", ""] as const;

describe("canOwnerReplaceLineFile — every order status × every line status", () => {
  it("covers every order status and every known line status", () => {
    expect([...LINE_PRODUCTION_STATUSES].sort()).toEqual(["DONE", "NEEDS_LAYOUT", "PRINTING", "WAITING"]);
    expect(ORDER_STATUSES.length).toBe(9);
  });

  for (const status of ORDER_STATUSES) {
    for (const lineStatus of LINE_STATUSES) {
      const expected =
        lineStatus === "NEEDS_LAYOUT" ? true : lineStatus === "WAITING" ? ALLOWED.has(status) : false;
      it(`${status} × ${lineStatus || "(empty)"} → ${expected}`, () => {
        const order = { status, deletedAt: null, cancelledAt: null, source: "studio" };
        expect(canOwnerReplaceLineFile(order, { productionStatus: lineStatus })).toBe(expected);
        const reason = ownerLineFileBlockReason(order, { productionStatus: lineStatus });
        if (expected) expect(reason).toBeNull();
        else if (lineStatus === "WAITING") expect(reason).toBe("order_status");
        else expect(reason).toBe("line_started");
      });
    }
  }

  it("the allowed statuses are exactly the dealer-editable ones plus the rest of the workshop phase", () => {
    expect([...OWNER_REPLACE_ORDER_STATUSES].sort()).toEqual([...ALLOWED].sort());
  });

  it("an unknown order status refuses a WAITING line", () => {
    expect(ownerLineFileBlockReason({ status: "ARCHIVED" }, { productionStatus: "WAITING" })).toBe("order_status");
  });
});

describe("canOwnerReplaceLineFile — deleted, cancelled, shop, paid", () => {
  const waiting = { productionStatus: "WAITING" };
  const flagged = { productionStatus: "NEEDS_LAYOUT" };

  for (const status of ORDER_STATUSES) {
    it(`${status}: deleted → refused (WAITING and NEEDS_LAYOUT)`, () => {
      const o = { status, deletedAt: new Date() };
      expect(ownerLineFileBlockReason(o, waiting)).toBe("deleted");
      expect(ownerLineFileBlockReason(o, flagged)).toBe("deleted");
    });
    it(`${status}: cancelled → refused (WAITING and NEEDS_LAYOUT)`, () => {
      const o = { status, cancelledAt: "2026-11-06T10:00:00.000Z", deletedAt: "2026-11-06T10:00:00.000Z" };
      expect(ownerLineFileBlockReason(o, waiting)).toBe("cancelled");
      expect(ownerLineFileBlockReason(o, flagged)).toBe("cancelled");
      expect(canOwnerReplaceLineFile(o, waiting)).toBe(false);
    });
  }

  it("cancelled wins over deleted (the dealer's cancel sets both)", () => {
    expect(ownerLineFileBlockReason({ status: "NEW", cancelledAt: new Date(), deletedAt: new Date() }, waiting)).toBe("cancelled");
  });

  it("shop orders: a WAITING line is refused in every status", () => {
    for (const status of ORDER_STATUSES) {
      expect(canOwnerReplaceLineFile({ status, source: "shop" }, waiting)).toBe(false);
    }
    expect(ownerLineFileBlockReason({ status: "SENT_TO_WORKSHOP", source: "shop" }, waiting)).toBe("shop");
  });

  it("shop orders: a started line still reads «line_started» (the more precise reason)", () => {
    expect(ownerLineFileBlockReason({ status: "WORKSHOP_PRINTING", source: "shop" }, { productionStatus: "PRINTING" })).toBe(
      "line_started",
    );
  });

  it("other sources (studio, telegram, null) are fine", () => {
    for (const source of ["studio", "telegram", "cabinet", null, undefined]) {
      expect(canOwnerReplaceLineFile({ status: "SENT_TO_WORKSHOP", source }, waiting)).toBe(true);
    }
  });

  it("paid orders are allowed: only the file changes, no money moves (unlike the whole-order edit)", () => {
    const paid = { status: "SENT_TO_WORKSHOP", isPaid: true, source: "studio" };
    expect(canOwnerReplaceLineFile(paid, waiting)).toBe(true);
    // The whole-order edit stays refused for the same paid order.
    expect(canDealerModifyOrder({ ...paid, orderLines: [waiting] })).toBe(false);
  });

  it("mixed order: banner printing, mug done, notebook waiting → only the notebook", () => {
    const order = { status: "WORKSHOP_PRINTING", source: "studio" };
    expect(canOwnerReplaceLineFile(order, { productionStatus: "PRINTING" })).toBe(false);
    expect(canOwnerReplaceLineFile(order, { productionStatus: "DONE" })).toBe(false);
    expect(canOwnerReplaceLineFile(order, { productionStatus: "WAITING" })).toBe(true);
    // The whole-order edit / cancel is locked for that order.
    expect(
      canDealerModifyOrder({
        ...order,
        isPaid: false,
        orderLines: [{ productionStatus: "PRINTING" }, { productionStatus: "DONE" }, { productionStatus: "WAITING" }],
      }),
    ).toBe(false);
  });

  it("archive reason differs from «Нужен макет»", () => {
    expect(OWNER_REPLACE_ARCHIVE_REASON).toBe("owner_replace");
    expect(OWNER_REPLACE_ARCHIVE_REASON).not.toBe("layout_issue");
  });
});

describe("cabinetLinePill", () => {
  it.each([
    ["WAITING", "waiting"],
    ["PRINTING", "printing"],
    ["DONE", "done"],
    ["NEEDS_LAYOUT", "needsLayout"],
    ["UNKNOWN", "waiting"],
    ["", "waiting"],
    [null, "waiting"],
    [undefined, "waiting"],
  ] as const)("%s → %s", (status, pill) => {
    expect(cabinetLinePill(status)).toBe(pill);
  });

  it("every pill has a label in ru / ro / en, and ru reads Ждёт / Печатается / Готово / Ждёт файл", () => {
    expect(layoutIssueRu.linePill).toEqual({ waiting: "Ждёт", printing: "Печатается", done: "Готово", needsLayout: "Ждёт файл" });
    for (const dict of [layoutIssueRu, layoutIssueRo, layoutIssueEn]) {
      for (const p of ["waiting", "printing", "done", "needsLayout"] as const) {
        expect(dict.linePill[p].length).toBeGreaterThan(0);
      }
    }
  });
});

describe("cabinetLinesDoneSummary + text", () => {
  const ls = (...s: string[]) => s.map((productionStatus) => ({ productionStatus }));

  it("mixed: banner printing, mug done, notebook waiting → 1 of 3 → «Готово 1 из 3»", () => {
    const sum = cabinetLinesDoneSummary(ls("PRINTING", "DONE", "WAITING"));
    expect(sum).toEqual({ done: 1, total: 3 });
    expect(layoutIssueRu.linesDoneSummary(sum!.done, sum!.total)).toBe("Готово 1 из 3");
    expect(layoutIssueRo.linesDoneSummary(1, 3)).toBe("Gata 1 din 3");
    expect(layoutIssueEn.linesDoneSummary(1, 3)).toBe("Done 1 of 3");
  });

  it("2 of 3 done", () => {
    expect(cabinetLinesDoneSummary(ls("DONE", "DONE", "WAITING"))).toEqual({ done: 2, total: 3 });
  });

  it("NEEDS_LAYOUT counts as not done", () => {
    expect(cabinetLinesDoneSummary(ls("DONE", "NEEDS_LAYOUT"))).toEqual({ done: 1, total: 2 });
  });

  it("nothing done yet → null (even when something prints)", () => {
    expect(cabinetLinesDoneSummary(ls("PRINTING", "WAITING", "WAITING"))).toBeNull();
    expect(cabinetLinesDoneSummary(ls("WAITING", "WAITING"))).toBeNull();
  });

  it("everything done → null (the order status says it)", () => {
    expect(cabinetLinesDoneSummary(ls("DONE", "DONE", "DONE"))).toBeNull();
  });

  it("a single line or no lines → null", () => {
    expect(cabinetLinesDoneSummary(ls("DONE"))).toBeNull();
    expect(cabinetLinesDoneSummary([])).toBeNull();
    expect(cabinetLinesDoneSummary(null)).toBeNull();
    expect(cabinetLinesDoneSummary(undefined)).toBeNull();
  });

  it("null statuses (cancelled order view) never count as done", () => {
    expect(cabinetLinesDoneSummary([{ productionStatus: null }, { productionStatus: null }])).toBeNull();
  });
});

describe("isOwnerReplaceMarkerVisible", () => {
  const at = "2026-11-06T12:20:00.000Z";
  it("shown on WAITING and PRINTING lines with a replacement", () => {
    expect(isOwnerReplaceMarkerVisible({ productionStatus: "WAITING", ownerReplacedAt: at })).toBe(true);
    expect(isOwnerReplaceMarkerVisible({ productionStatus: "PRINTING", ownerReplacedAt: new Date(at) })).toBe(true);
  });
  it("hidden on DONE / NEEDS_LAYOUT lines and without a replacement", () => {
    expect(isOwnerReplaceMarkerVisible({ productionStatus: "DONE", ownerReplacedAt: at })).toBe(false);
    expect(isOwnerReplaceMarkerVisible({ productionStatus: "NEEDS_LAYOUT", ownerReplacedAt: at })).toBe(false);
    expect(isOwnerReplaceMarkerVisible({ productionStatus: "WAITING", ownerReplacedAt: null })).toBe(false);
    expect(isOwnerReplaceMarkerVisible({ productionStatus: "WAITING" })).toBe(false);
    expect(isOwnerReplaceMarkerVisible({ ownerReplacedAt: at })).toBe(false);
  });
});

describe("step 4 wording", () => {
  it("board marker names the dealer or the client", () => {
    expect(layoutIssueRu.ownerReplacedAt(true, "14:20")).toBe("Файл заменён дилером 14:20");
    expect(layoutIssueRu.ownerReplacedAt(false, "14:20")).toBe("Файл заменён клиентом 14:20");
    expect(layoutIssueRo.ownerReplacedAt(true, "14:20")).toContain("dealer");
    expect(layoutIssueEn.ownerReplacedAt(false, "14:20")).toContain("client");
  });

  it("the replace dialog never says «нужен новый макет»", () => {
    expect(layoutIssueRu.ownerReplaceTitle("#0042.3/3")).toBe("Заменить файл позиции #0042.3/3");
    expect(layoutIssueRu.ownerReplaceTitle("#0042.3/3").toLowerCase()).not.toContain("макет");
    expect(layoutIssueRu.ownerReplaceHint.toLowerCase()).not.toContain("нужен новый макет");
  });

  it("history, in-work hint and locked plaque text", () => {
    expect(layoutIssueRu.historyOwnerReplaced("#0042.3/3", true)).toContain("дилером");
    expect(layoutIssueRu.historyOwnerReplaced("#0042.3/3", false)).toContain("клиентом");
    expect(layoutIssueRu.lineInWorkHint).toBe("Уже в работе — файл не изменить");
    expect(layoutIssueRu.lockedWaitingFilesHint).toContain("можно заменить");
    expect(layoutIssueRu.ownerReplaceStarted).toContain("уже начал");
  });

  it("ru / ro / en define every step-4 key", () => {
    const keys = [
      "linePill",
      "linesDoneSummary",
      "ownerReplaceButton",
      "ownerReplaceTitle",
      "ownerReplaceHint",
      "ownerReplaceDone",
      "ownerReplaceStarted",
      "ownerReplaceLocked",
      "lineInWorkHint",
      "cabinetOwnerReplacedNotice",
      "ownerReplacedAt",
      "historyOwnerReplaced",
      "lockedWaitingFilesHint",
    ] as const;
    for (const dict of [layoutIssueRu, layoutIssueRo, layoutIssueEn]) {
      for (const k of keys) expect(dict[k], k).toBeTruthy();
    }
    expect(layoutIssueRo.ownerReplaceHint).not.toBe(layoutIssueRu.ownerReplaceHint);
    expect(layoutIssueEn.ownerReplaceHint).not.toBe(layoutIssueRu.ownerReplaceHint);
  });
});
