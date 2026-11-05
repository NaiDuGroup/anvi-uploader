import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ru } from "@/lib/i18n/ru";
import { ro } from "@/lib/i18n/ro";
import { en } from "@/lib/i18n/en";
import { OrdersPaginationBar } from "./OrdersListControls";

function render(t: typeof ru) {
  return renderToStaticMarkup(
    createElement(OrdersPaginationBar, {
      page: 2,
      pageSize: 50,
      totalPages: 3,
      totalCount: 120,
      loading: false,
      t,
      setPage: vi.fn(),
      setPageSize: vi.fn(),
    }),
  );
}

describe("OrdersPaginationBar", () => {
  it("names the icon-only prev/next buttons in every language", () => {
    expect(render(ru)).toContain('aria-label="Предыдущая страница"');
    expect(render(ru)).toContain('aria-label="Следующая страница"');
    expect(render(ro)).toContain('aria-label="Pagina următoare"');
    expect(render(en)).toContain('aria-label="Previous page"');
  });
});
