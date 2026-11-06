import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileQuestion } from "lucide-react";
import { LineMoreMenu, lineMenuItemKeys } from "./LineMoreMenu";
import {
  LineLayoutIssueInfo,
  LineStatusControls,
  LineStatusPill,
} from "./workshopBoard/LineStatusControls";
import type { WorkshopBoardLine } from "@/lib/workshopBoard/types";
import { layoutIssueRu } from "@/lib/i18n/layoutIssue/ru";
import { layoutIssueRo } from "@/lib/i18n/layoutIssue/ro";
import { layoutIssueEn } from "@/lib/i18n/layoutIssue/en";
import { ru } from "@/lib/i18n/ru";
import { ro } from "@/lib/i18n/ro";
import { en } from "@/lib/i18n/en";
import { ServerLocaleProvider } from "@/stores/useLanguageStore";
import type { ReactElement } from "react";

/** Render in Russian (the store default is Romanian). */
const renderRu = (el: ReactElement) => renderToStaticMarkup(createElement(ServerLocaleProvider, { locale: "ru" }, el));

/** Server-rendered markup only (no DOM in this repo); open/close is covered by e2e. */

function boardLine(over: Partial<WorkshopBoardLine>): WorkshopBoardLine {
  return {
    uid: "o1::l1",
    orderId: "o1",
    orderLineId: "l1",
    orderNumber: 42,
    lineIndex: 1,
    totalLines: 2,
    phone: "",
    clientName: null,
    status: "SENT_TO_WORKSHOP",
    lineStatus: "WAITING",
    isPrio: false,
    unreadCommentCount: 0,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    productType: "large_format_print",
    facts: {} as WorkshopBoardLine["facts"],
    files: [],
    notes: null,
    createdByName: null,
    sentToWorkshopByName: null,
    ...over,
  } as WorkshopBoardLine;
}

const controls = (over: Partial<WorkshopBoardLine>) =>
  renderRu(createElement(LineStatusControls, { line: boardLine(over) }));

describe("lineMenuItemKeys", () => {
  it("flaggable line → «Проблема с файлом…» only", () => {
    expect(lineMenuItemKeys({ canFlag: true, flagged: false })).toEqual(["flagLayout"]);
  });
  it("flagged line → «Снять отметку» only (never both)", () => {
    expect(lineMenuItemKeys({ canFlag: false, flagged: true })).toEqual(["clearLayout"]);
    expect(lineMenuItemKeys({ canFlag: true, flagged: true })).toEqual(["clearLayout"]);
  });
  it("line that cannot be flagged → no items (no menu)", () => {
    expect(lineMenuItemKeys({ canFlag: false, flagged: false })).toEqual([]);
  });
});

describe("LineMoreMenu (closed)", () => {
  it("renders an accessible «⋯» button, no menu until opened", () => {
    const html = renderToStaticMarkup(
      createElement(LineMoreMenu, {
        label: "Ещё действия",
        testId: "line-more-x",
        items: [{ key: "a", label: "Проблема с файлом…", icon: FileQuestion, onSelect: vi.fn(), testId: "item-a" }],
      }),
    );
    expect(html).toContain('data-testid="line-more-x"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Ещё действия"');
    expect(html).toContain('title="Ещё действия"');
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain("item-a");
  });

  it("no items → nothing rendered", () => {
    const html = renderToStaticMarkup(createElement(LineMoreMenu, { label: "x", items: [] }));
    expect(html).toBe("");
  });
});

describe("board line controls: calm «Ждёт файл»", () => {
  it("waiting line: «⋯» instead of a red «Нужен макет» button", () => {
    const html = controls({ lineStatus: "WAITING" });
    expect(html).toContain('data-testid="line-more-l1"');
    expect(html).not.toContain("line-flag-layout-l1"); // inside the closed menu
    expect(html).not.toContain("Нужен макет");
    expect(html).not.toMatch(/rose-|red-/);
  });

  it("done line (cannot be flagged) → no «⋯» menu", () => {
    const html = controls({ lineStatus: "DONE" });
    expect(html).not.toContain("line-more-l1");
  });

  it("flagged line: amber «Ждёт файл» pill + neutral «Заменить файл» + «⋯»", () => {
    const html = controls({ lineStatus: "NEEDS_LAYOUT" });
    expect(html).toContain("Ждёт файл");
    expect(html).toContain('data-testid="line-replace-layout-l1"');
    expect(html).toContain('data-testid="line-more-l1"');
    expect(html).not.toContain("line-clear-layout-l1"); // only inside the open menu
    expect(html).not.toMatch(/rose-|red-|violet-/);
    const at = html.indexOf('data-testid="line-replace-layout-l1"');
    const tag = html.slice(html.lastIndexOf("<", at), html.indexOf(">", at));
    expect(tag).toContain("border-gray-300");
  });

  it("flagged note: amber reason · «comment» · wait, no AlertTriangle", () => {
    const html = renderRu(
      createElement(LineLayoutIssueInfo, {
        line: boardLine({
          lineStatus: "NEEDS_LAYOUT",
          layoutIssue: { reason: "lowQuality", note: "72 dpi", since: new Date(Date.now() - 3 * 3600_000).toISOString() },
        }),
      }),
    );
    expect(html).toContain("bg-amber-50");
    expect(html).toContain(layoutIssueRu.reasons.lowQuality);
    expect(html).toContain("«72 dpi»");
    expect(html).toContain("3 ч");
    expect(html).not.toMatch(/rose-|red-|triangle/i);
  });

  it("NEEDS_LAYOUT pill is amber", () => {
    const html = renderRu(createElement(LineStatusPill, { status: "NEEDS_LAYOUT" }));
    expect(html).toContain("bg-amber-50");
    expect(html).toContain("Ждёт файл");
  });
});

describe("wording: «Проблема с файлом» / «Ждёт файл»", () => {
  const strings = (v: unknown): string[] => {
    if (typeof v === "string") return [v];
    if (typeof v === "function") {
      const fn = v as (...a: unknown[]) => unknown;
      const argSets: unknown[][] = [["#0042.1/2", "Причина", "коммент"], [2, "x", "y"], [["#0042.1/2"], "Печатается"], [["#1", "#2"], "Печатается"]];
      return argSets.flatMap((args) => {
        try {
          const out = fn(...args);
          return typeof out === "string" ? [out] : [];
        } catch {
          return [];
        }
      });
    }
    if (v && typeof v === "object") return Object.values(v).flatMap(strings);
    return [];
  };

  it("no ru layout-issue / line-status string says «Нужен макет» / «Ждёт макет» / «нового макета»", () => {
    const all = [...strings(layoutIssueRu), ...strings(ru.lineStatus)];
    for (const s of all) {
      expect(s).not.toMatch(/нужен (новый )?макет|ждёт макет|ждут макет|нового макета/i);
    }
    expect(layoutIssueRu.flagButton).toBe("Проблема с файлом…");
    expect(layoutIssueRu.modalTitle("#9.1/2")).toBe("Проблема с файлом · #9.1/2");
    expect(layoutIssueRu.waitingLabel).toBe("Ждёт файл");
    expect(layoutIssueRu.linePill.needsLayout).toBe("Ждёт файл");
    expect(layoutIssueRu.adminFilter).toBe("Ждёт файл");
    expect(layoutIssueRu.cabinetLineTitle).toBe("Цех просит заменить файл");
    expect(ru.lineStatus.NEEDS_LAYOUT).toBe("Ждёт файл");
    expect(layoutIssueRu.moreActions).toBe("Ещё действия");
  });

  it("ro / en have every key and drop «machetă» / «layout» from this feature", () => {
    const keys = Object.keys(layoutIssueRu).sort();
    expect(Object.keys(layoutIssueRo).sort()).toEqual(keys);
    expect(Object.keys(layoutIssueEn).sort()).toEqual(keys);
    for (const d of [layoutIssueRo, layoutIssueEn]) {
      expect(d.moreActions.length).toBeGreaterThan(0);
      for (const k of ["flagButton", "waitingLabel", "adminFilter", "confirm", "cabinetLineTitle"] as const) {
        expect(d[k]).not.toMatch(/machet|layout/i);
      }
      expect(d.linePill.needsLayout).not.toMatch(/machet|layout/i);
    }
    expect(ro.lineStatus.NEEDS_LAYOUT).toBe("Așteaptă fișier");
    expect(en.lineStatus.NEEDS_LAYOUT).toBe("Waiting for file");
  });
});

describe("no AlertTriangle / rose for this feature", () => {
  const root = path.resolve(__dirname, "../../../..");
  it.each([
    "src/app/admin/_components/workshopBoard/LineStatusControls.tsx",
    "src/app/admin/_components/AdminLineLayoutIssue.tsx",
    "src/app/admin/_components/LayoutIssueModal.tsx",
    "src/app/admin/_components/OrderLineStatusBadges.tsx",
  ])("%s", (file) => {
    const src = readFileSync(path.join(root, file), "utf8");
    expect(src).not.toMatch(/AlertTriangle/);
    expect(src).not.toMatch(/\brose-\d/);
  });
});
