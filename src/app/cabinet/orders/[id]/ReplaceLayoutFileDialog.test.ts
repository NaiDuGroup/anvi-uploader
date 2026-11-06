import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ru } from "@/lib/i18n/ru";
import { ReplaceLayoutFileDialog } from "./ReplaceLayoutFileDialog";

/** Server-rendered markup of the cabinet replace dialog (no DOM setup in this repo). */
function render(mode?: "layout" | "replace") {
  return renderToStaticMarkup(
    createElement(ReplaceLayoutFileDialog, {
      orderId: "o1",
      lineId: "l3",
      lineCode: "#0042.3/3",
      mode,
      declared: null,
      t: ru,
      onDone: vi.fn(),
      onClose: vi.fn(),
    }),
  );
}

describe("ReplaceLayoutFileDialog wording", () => {
  it("default («Нужен макет») keeps the layout wording", () => {
    const html = render();
    expect(html).toContain(ru.layoutIssue.replaceTitle("#0042.3/3"));
    expect(html).toContain(ru.layoutIssue.replaceHint);
    expect(html).not.toContain(ru.layoutIssue.ownerReplaceHint);
  });

  it("replace mode (waiting position): own title and hint, no «нужен новый макет»", () => {
    const html = render("replace");
    expect(html).toContain("Заменить файл позиции #0042.3/3");
    expect(html).toContain(ru.layoutIssue.ownerReplaceHint);
    expect(html).not.toContain(ru.layoutIssue.replaceTitle("#0042.3/3"));
    expect(html.toLowerCase()).not.toContain("нужен новый макет");
    expect(html).toContain('data-testid="replace-file-dialog"');
    // Save disabled until a file is picked.
    const at = html.indexOf('data-testid="replace-file-confirm"');
    const tag = html.slice(html.lastIndexOf("<", at), html.indexOf(">", at));
    expect(tag).toContain("disabled");
  });
});
