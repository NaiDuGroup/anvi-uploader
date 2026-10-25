/**
 * Unified stock categories that keep their own admin screen instead of the
 * generic category page. The Склад hub links the category's card there, and
 * `/admin/stock/c/<code>` redirects there.
 */
export const DEDICATED_CATEGORY_PAGES: Readonly<Record<string, string>> = {
  mugs: "/admin/mug-catalog",
  notebooks: "/admin/notebook-catalog",
  pens: "/admin/pen-catalog",
  // Rolls and papers keep their pricing screens (print prices, size presets, sheet rates).
  roll_media: "/admin/large-format-materials",
  sheet_paper: "/admin/sheet-papers",
};

export function dedicatedCategoryPage(code: string): string | null {
  return Object.prototype.hasOwnProperty.call(DEDICATED_CATEGORY_PAGES, code)
    ? DEDICATED_CATEGORY_PAGES[code]!
    : null;
}
