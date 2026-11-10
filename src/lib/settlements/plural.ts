/** Plural helpers for the «Взаиморасчёты» labels. */

/** Russian form: 1 контрагент, 2 контрагента, 5 контрагентов (11–14 → many). */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(Math.trunc(n));
  const mod10 = a % 10;
  const mod100 = a % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «N word» in Russian. */
export function countRu(n: number, one: string, few: string, many: string): string {
  return `${n} ${pluralRu(n, one, few, many)}`;
}

/** Romanian form: 1 → one, else other. */
export function pluralRo(n: number, one: string, other: string): string {
  return Math.abs(n) === 1 ? one : other;
}

/**
 * «N word» in Romanian: 1 factură, 2 facturi, 20 de facturi (numbers whose
 * last two digits are 0 or ≥ 20, except 0 itself, take «de»).
 */
export function countRo(n: number, one: string, other: string): string {
  const a = Math.abs(Math.trunc(n));
  if (a === 1) return `${n} ${one}`;
  const mod100 = a % 100;
  return a !== 0 && (mod100 === 0 || mod100 >= 20) ? `${n} de ${other}` : `${n} ${other}`;
}

/** «N word» in English. */
export function countEn(n: number, one: string, other: string): string {
  return `${n} ${Math.abs(n) === 1 ? one : other}`;
}
