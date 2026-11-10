/** Pure request / response helpers for the «Взаиморасчёты» routes (unit-tested). */

export const IDNO_PATTERN = /^[0-9A-Za-z]{4,20}$/;

/**
 * Route param / body IDNO → trimmed IDNO or null. Next already decodes
 * dynamic params, so no second decodeURIComponent (that would throw on «%»).
 */
export function parseIdnoValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const idno = raw.trim();
  return IDNO_PATTERN.test(idno) ? idno : null;
}

/**
 * Opening-balance amount: a finite number or a numeric string («-1234.5»,
 * «1 234,50»). Anything else (null, "", booleans, objects) → null.
 */
export function parseAmountValue(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\s ]/g, "").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * `inline; filename="<ascii>.pdf"; filename*=UTF-8''<utf8>.pdf` — the quoted
 * ASCII fallback never carries non-ASCII bytes or quotes.
 */
export function pdfContentDisposition(baseName: string): string {
  const ascii =
    baseName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/-_|_-/g, "-")
      .replace(/^_|_$/g, "") || "document";
  return `inline; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(`${baseName}.pdf`)}`;
}
