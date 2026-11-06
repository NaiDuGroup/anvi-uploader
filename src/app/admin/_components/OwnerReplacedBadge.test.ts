import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { layoutIssueRu } from "@/lib/i18n/layoutIssue/ru";
import { layoutIssueEn } from "@/lib/i18n/layoutIssue/en";
import { formatLayoutFixedTime } from "@/lib/layoutIssueClient";
import { OwnerReplacedBadge } from "./OwnerReplacedBadge";

describe("OwnerReplacedBadge (board / admin list line card)", () => {
  const at = new Date();
  at.setHours(14, 20, 0, 0);
  const iso = at.toISOString();

  it("dealer: «Файл заменён дилером 14:20» today", () => {
    const html = renderToStaticMarkup(createElement(OwnerReplacedBadge, { at: iso, role: "dealer", li: layoutIssueRu, testId: "x" }));
    expect(html).toContain("Файл заменён дилером 14:20");
    expect(html).toContain('data-testid="x"');
  });

  it("client (and unknown role) → «клиентом»", () => {
    for (const role of ["client", null, undefined, "weird"]) {
      const html = renderToStaticMarkup(createElement(OwnerReplacedBadge, { at: iso, role, li: layoutIssueRu }));
      expect(html).toContain("Файл заменён клиентом 14:20");
    }
  });

  it("another day shows the date too", () => {
    const old = new Date(at.getTime() - 3 * 24 * 3600_000).toISOString();
    const html = renderToStaticMarkup(createElement(OwnerReplacedBadge, { at: old, role: "dealer", li: layoutIssueRu }));
    expect(html).toContain(`Файл заменён дилером ${formatLayoutFixedTime(old)}`);
    expect(formatLayoutFixedTime(old)).toMatch(/^\d\d\.\d\d \d\d:\d\d$/);
  });

  it("English wording", () => {
    const html = renderToStaticMarkup(createElement(OwnerReplacedBadge, { at: iso, role: "dealer", li: layoutIssueEn }));
    expect(html).toContain("File replaced by the dealer 14:20");
  });
});
