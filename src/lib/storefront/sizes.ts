import type { ShopLang } from "./i18n";

/**
 * Garment / item sizes as the stock stores them (`StockVariant.options.size`:
 * «M», «XXL», «6 мес», «38», «40-42») → their order on the shop and their
 * label in the visitor's language. The stored string stays the key (cart,
 * quote, stock); only the display changes. Pure (client-safe, unit-tested).
 */

/** Letter sizes, smallest first (XXL = 2XL, XXXL = 3XL, XXS = 2XS). */
const LETTER_ORDER = ["4XS", "3XS", "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];

function letterKey(size: string): string {
  const s: string = size.trim().toUpperCase().replace(/\s+/g, "");
  const m = /^(X{2,})(S|L)$/.exec(s);
  return m ? `${m[1]!.length}X${m[2]}` : s;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const RANGE = new RegExp(String.raw`^${NUM}(?:\s*[-–—/]\s*${NUM})?\s*`);
const MONTH_UNIT = /^(?:мес(?:яц(?:а|ев)?)?|luni|lună|luna|months?|mos?)\.?$/i;
const YEAR_UNIT = /^(?:лет|года?|ani|an|years?|yrs?)\.?$/i;

/** «6 мес», «6-9 мес.», «2 года» → months (from, to); null when not an age size. */
export function parseAgeSize(size: string): { unit: "month" | "year"; from: number; to: number | null } | null {
  const m = RANGE.exec(size.trim());
  if (!m) return null;
  const unit: string = size.trim().slice(m[0].length).trim();
  const kind: "month" | "year" | null = MONTH_UNIT.test(unit) ? "month" : YEAR_UNIT.test(unit) ? "year" : null;
  if (!kind) return null;
  const num = (s: string | undefined): number | null => (s == null ? null : Number(s.replace(",", ".")));
  return { unit: kind, from: num(m[1])!, to: num(m[2]) };
}

/** Numeric size («38», «40-42», «110 cm»): its first number; null otherwise. */
function numericSize(size: string): number | null {
  const m = RANGE.exec(size.trim());
  if (!m) return null;
  const rest: string = size.trim().slice(m[0].length).trim();
  if (rest && !/^(?:cm|см)\.?$/i.test(rest)) return null;
  return Number(m[1]!.replace(",", "."));
}

/**
 * Sort key of a size: age sizes (months, years as 12 months) first, then
 * letter sizes, then numeric ones, then anything else in stored order.
 */
export function sizeSortKey(size: string): [number, number] {
  const age = parseAgeSize(size);
  if (age) return [0, (age.unit === "year" ? 12 : 1) * age.from];
  const letter: number = LETTER_ORDER.indexOf(letterKey(size));
  if (letter >= 0) return [1, letter];
  const n: number | null = numericSize(size);
  if (n != null) return [2, n];
  return [3, 0];
}

/** Comparator for `Array.sort`: babies by age, then XS…5XL, then 38, 40… (stable for unknown sizes). */
export function compareSizes(a: string, b: string): number {
  const ka = sizeSortKey(a);
  const kb = sizeSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}

function numText(n: number, lang: ShopLang): string {
  const s: string = String(n);
  return lang === "en" ? s : s.replace(".", ",");
}

/** Romanian count noun: «1 lună», «6 luni», «20 de luni». */
function roCount(n: number, one: string, many: string): string {
  if (n === 1) return one;
  const r: number = Math.trunc(n) % 100;
  return Number.isInteger(n) && (n === 0 || r === 0 || r >= 20) ? `de ${many}` : many;
}

function ruYears(n: number): string {
  if (!Number.isInteger(n)) return "года";
  const m10: number = n % 10;
  const m100: number = n % 100;
  if (m10 === 1 && m100 !== 11) return "год";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "года";
  return "лет";
}

/**
 * A size in the visitor's language: «6 мес» → «6 luni» / «6 мес.» /
 * «6 months»; letter and numeric sizes as they are («M», «38»).
 */
export function shopSizeLabel(size: string, lang: ShopLang): string {
  const age = parseAgeSize(size);
  if (!age) {
    const trimmed: string = size.trim();
    return LETTER_ORDER.includes(letterKey(trimmed)) ? trimmed.toUpperCase() : trimmed;
  }
  const last: number = age.to ?? age.from;
  const value: string = age.to != null ? `${numText(age.from, lang)}–${numText(age.to, lang)}` : numText(age.from, lang);
  if (age.unit === "month") {
    if (lang === "ru") return `${value} мес.`;
    if (lang === "en") return `${value} ${last === 1 ? "month" : "months"}`;
    return `${value} ${roCount(last, "lună", "luni")}`;
  }
  if (lang === "ru") return `${value} ${ruYears(last)}`;
  if (lang === "en") return `${value} ${last === 1 ? "year" : "years"}`;
  return `${value} ${roCount(last, "an", "ani")}`;
}

/** A size number in the language: «1,5» (ro / ru, decimal comma), «1.5» (en); at most two decimals. */
export function shopNumText(n: number, lang: ShopLang): string {
  const s: string = String(Math.round(n * 100) / 100);
  return lang === "en" ? s : s.replace(".", ",");
}

/** «1,5×45 cm» / «1,5×45 см» / «1.5×45 cm». */
export function shopCmSizeText(widthCm: number, heightCm: number, lang: ShopLang): string {
  return `${shopNumText(widthCm, lang)}×${shopNumText(heightCm, lang)} ${lang === "ru" ? "см" : "cm"}`;
}

/**
 * Price-list sizes as shown for an orientation: each size turned to it
 * (portrait 50×70, landscape 70×50; squares as they are) and sorted by width,
 * then height. `index` is the size's place in `presets`.
 */
export function orientedPresets<T extends { widthCm: number; heightCm: number }>(
  presets: readonly T[],
  landscape: boolean,
): { preset: T; index: number; widthCm: number; heightCm: number }[] {
  return presets
    .map((preset, index) => {
      const long: number = Math.max(preset.widthCm, preset.heightCm);
      const short: number = Math.min(preset.widthCm, preset.heightCm);
      return landscape
        ? { preset, index, widthCm: long, heightCm: short }
        : { preset, index, widthCm: short, heightCm: long };
    })
    .sort((a, b) => a.widthCm - b.widthCm || a.heightCm - b.heightCm || a.index - b.index);
}
