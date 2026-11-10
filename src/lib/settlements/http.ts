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

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "iu", я: "ia",
};

function translitCyrillic(s: string): string {
  return s.replace(/[а-яё]/gi, (ch) => {
    const lower = ch.toLowerCase();
    const out = CYRILLIC[lower] ?? "";
    if (ch === lower || !out) return out;
    return out.charAt(0).toUpperCase() + out.slice(1);
  });
}

/**
 * Name → file-name slug: dots / quotes / apostrophes dropped («S.R.L.» → «SRL»),
 * any other run of separators → one «-». `ascii` also strips diacritics
 * (ș → s) and transliterates Cyrillic; otherwise letters are kept as they are.
 */
export function fileNameSlug(name: string, ascii: boolean, max = 40): string {
  let s = name.normalize("NFC").replace(/[.'"`«»„“”‘’]+/g, "");
  if (ascii) {
    s = translitCyrillic(s.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC")).replace(/[^A-Za-z0-9]+/g, "-");
  } else {
    s = s.replace(/[^\p{L}\p{N}]+/gu, "-");
  }
  return s.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, max).replace(/-$/, "");
}

/**
 * Act PDF file name without «.pdf»: `act-sverki-CRAFTI-BUSINESS-SRL-1004600069507`.
 * `utf8` keeps non-Latin letters (for `filename*`), `ascii` is the safe fallback.
 */
export function actFileName(prefix: string, name: string | null | undefined, idno: string): { ascii: string; utf8: string } {
  const join = (slug: string) => [prefix, slug, idno].filter(Boolean).join("-");
  return { ascii: join(fileNameSlug(name ?? "", true)), utf8: join(fileNameSlug(name ?? "", false)) };
}

/**
 * `inline; filename="<ascii>.pdf"; filename*=UTF-8''<utf8>.pdf` — the quoted
 * ASCII fallback never carries non-ASCII bytes or quotes. `utf8Name` (default
 * `baseName`) goes into `filename*`.
 */
export function pdfContentDisposition(baseName: string, utf8Name: string = baseName): string {
  const ascii =
    baseName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/-_|_-/g, "-")
      .replace(/^_|_$/g, "") || "document";
  return `inline; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(`${utf8Name}.pdf`)}`;
}
