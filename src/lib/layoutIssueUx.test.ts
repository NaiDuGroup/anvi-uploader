import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { layoutLinkAllowed, otherLinesProgress } from "@/lib/layoutIssue";
import { otherLinesSentence } from "@/lib/layoutIssueClient";
import { layoutIssueRu } from "@/lib/i18n/layoutIssue/ru";
import { layoutIssueEn } from "@/lib/i18n/layoutIssue/en";
import { layoutIssueRo } from "@/lib/i18n/layoutIssue/ro";

describe("cabinet sentence about the other positions of a flagged one", () => {
  const sentence = (lines: { id: string; productionStatus: string }[], id = "a") =>
    otherLinesSentence(layoutIssueRu, otherLinesProgress(lines, id));

  it("another position printing or printed → «уже в работе»", () => {
    expect(sentence([{ id: "a", productionStatus: "NEEDS_LAYOUT" }, { id: "b", productionStatus: "WAITING" }, { id: "c", productionStatus: "PRINTING" }])).toBe(
      "Остальные позиции заказа уже в работе.",
    );
    expect(sentence([{ id: "a", productionStatus: "NEEDS_LAYOUT" }, { id: "b", productionStatus: "DONE" }])).toBe(
      "Остальные позиции заказа уже в работе.",
    );
  });

  it("the others all waiting (or flagged too) → «идут дальше по очереди»", () => {
    expect(sentence([{ id: "a", productionStatus: "NEEDS_LAYOUT" }, { id: "b", productionStatus: "WAITING" }, { id: "c", productionStatus: "NEEDS_LAYOUT" }])).toBe(
      "Остальные позиции заказа идут дальше по очереди.",
    );
  });

  it("the only position → no sentence", () => {
    expect(sentence([{ id: "a", productionStatus: "NEEDS_LAYOUT" }])).toBeNull();
    expect(otherLinesProgress([], "a")).toBeNull();
  });

  it("ro / en have both sentences", () => {
    for (const d of [layoutIssueEn, layoutIssueRo]) {
      expect(otherLinesSentence(d, "inWork")).toBeTruthy();
      expect(otherLinesSentence(d, "queued")).toBeTruthy();
      expect(otherLinesSentence(d, "inWork")).not.toBe(otherLinesSentence(d, "queued"));
    }
  });
});

describe("«Снять отметку» confirm title", () => {
  it("names the line, no trailing explanation in the title", () => {
    expect(layoutIssueRu.clearConfirm("#0042.2/3")).toBe("Снять отметку «Нужен макет» с позиции #0042.2/3?");
    expect(layoutIssueRu.clear).toBe("Снять отметку");
    expect(layoutIssueRu.cancel).toBe("Отмена");
  });
});

describe("staff replace: links", () => {
  it("allowed except sheet products and DTF", () => {
    expect(layoutLinkAllowed("large_format_print")).toBe(true);
    expect(layoutLinkAllowed("mug")).toBe(true);
    expect(layoutLinkAllowed("paper_print")).toBe(true);
    expect(layoutLinkAllowed("business_card")).toBe(false);
    expect(layoutLinkAllowed("flyer")).toBe(false);
    expect(layoutLinkAllowed("dtf_apparel")).toBe(false);
  });
});

describe("layout-issue UI uses in-page dialogs only", () => {
  const root = path.resolve(__dirname, "../..");
  const files = [
    "src/app/admin/_components/AdminPageClient.tsx",
    "src/app/admin/_components/WorkshopBoardClient.tsx",
    "src/app/admin/_components/AdminLineLayoutIssue.tsx",
    "src/app/admin/_components/LayoutIssueModal.tsx",
    "src/app/admin/_components/ClearLayoutIssueDialog.tsx",
    "src/app/admin/_components/StaffReplaceLayoutFileDialog.tsx",
    "src/app/admin/_components/workshopBoard/LineStatusControls.tsx",
    "src/app/cabinet/orders/[id]/OrderDetailClient.tsx",
    "src/app/cabinet/orders/[id]/ReplaceLayoutFileDialog.tsx",
  ];
  it.each(files)("%s has no window.confirm", (file) => {
    const src = readFileSync(path.join(root, file), "utf8");
    expect(src).not.toMatch(/\bwindow\.confirm\s*\(/);
    expect(src).not.toMatch(/(^|[^.\w])confirm\(/m);
  });
});
