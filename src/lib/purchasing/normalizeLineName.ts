/**
 * Stable key for a supplier's invoice line name. Suppliers re-type the same
 * item with cosmetic differences (case, quotes, trailing spaces), so mappings
 * are keyed on this normalized form rather than the raw text.
 */
export function normalizeLineName(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u201c\u201d\u201e\u00ab\u00bb"'`]/g, "")
    .replace(/\s*([x×*])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
