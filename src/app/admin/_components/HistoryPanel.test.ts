import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ro } from "@/lib/i18n/ro";
import { HistoryRow, type HistoryEntry } from "./HistoryPanel";

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  id: "1",
  action: "field_updated",
  field: null,
  oldValue: null,
  newValue: null,
  metadata: null,
  createdAt: "2026-11-08T10:00:00.000Z",
  userName: "Vera",
  userRole: "admin",
  ...over,
});

const render = (e: HistoryEntry) => renderToStaticMarkup(createElement(HistoryRow, { entry: e, locale: "ro", t: ro }));

describe("HistoryRow", () => {
  it("sentence with actor + role, no raw action badge", () => {
    const html = render(entry({ field: "isPrio", newValue: "true" }));
    expect(html).toContain("Vera");
    expect(html).toContain("(studio)");
    expect(html).toContain("a marcat comanda ca urgentă");
    expect(html).not.toContain("field_updated");
    expect(html).not.toContain("modificare");
  });

  it("status chips old → new in the list colours", () => {
    const html = render(entry({ action: "status_changed", field: "status", oldValue: "NEW", newValue: "DELIVERED" }));
    expect(html).toContain(ro.statuses.NEW);
    expect(html).toContain(ro.statuses.DELIVERED);
    expect(html).toContain("bg-emerald-50");
    expect(html).not.toContain("hover:");
  });

  it("edit summary line", () => {
    const html = render(
      entry({ field: "order_structure", metadata: { changes: [{ kind: "line_qty", name: "Căni", type: "mug", from: 10, to: 12 }] } }),
    );
    expect(html).toContain("Căni: 10 → 12 buc");
  });
});
