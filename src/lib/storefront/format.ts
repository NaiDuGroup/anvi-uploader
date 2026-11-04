import type { ShopLang } from "./i18n";

/**
 * «139 lei» / «139 лей»; «12,50 lei» for fractional amounts. Thin spaces in
 * thousands («1 280 lei») with a normal no-break space before the currency.
 */
export function formatPrice(amount: number, lang: ShopLang): string {
  const rounded: number = Math.round(amount * 100) / 100;
  const whole: boolean = Number.isInteger(rounded);
  const [intPart, frac] = Math.abs(rounded).toFixed(whole ? 0 : 2).split(".");
  const grouped: string = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign: string = rounded < 0 ? "−" : "";
  const num: string = frac ? `${grouped},${frac}` : grouped;
  return `${sign}${num} ${lang === "ru" ? "лей" : "lei"}`;
}

/** Date of an order for the status page («4 noiembrie 2026» / «4 ноября 2026»). */
export function formatOrderDate(iso: string, lang: ShopLang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Chisinau",
  }).format(d);
}
