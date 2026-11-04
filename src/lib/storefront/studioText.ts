import { displayTime, hoursSummary, type WeekHours } from "@/lib/studioInfo/studioHours";
import type { Weekday } from "@/lib/studioInfo/studioInfo";
import { shopT, type ShopLang } from "./i18n";

/**
 * Studio facts as storefront text: opening hours in one line and contact
 * names in the page's script. Pure (unit-tested).
 */

const DAY: Record<ShopLang, Record<Weekday, string>> = {
  ro: { mon: "Lu", tue: "Ma", wed: "Mi", thu: "Jo", fri: "Vi", sat: "Sâ", sun: "Du" },
  ru: { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" },
};

/** «Lu–Vi 9:00–18:00 · Sâ 10:00–15:00 · Du închis (pauză 12:30–13:10)». */
export function formatShopHours(hours: WeekHours, lang: ShopLang): string {
  const t = shopT(lang);
  const { rows, lunch } = hoursSummary(hours);
  const parts: string[] = rows.map((r) => {
    const days: string = r.fromDay === r.toDay ? DAY[lang][r.fromDay] : `${DAY[lang][r.fromDay]}–${DAY[lang][r.toDay]}`;
    return `${days} ${r.span ? `${displayTime(r.span.from)}–${displayTime(r.span.to)}` : t("hoursClosed")}`;
  });
  const text: string = parts.join(" · ");
  return lunch ? `${text} (${t("hoursLunch", { from: displayTime(lunch.from), to: displayTime(lunch.to) })})` : text;
}

const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "io", ж: "j", з: "z", и: "i", й: "i", к: "c", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ț", ч: "ci", ш: "ș",
  щ: "ș", ъ: "", ы: "î", ь: "", э: "e", ю: "iu", я: "ia",
};

/**
 * A contact name for the page language: in Romanian a Cyrillic name is
 * written the Romanian way («Ангелина» → «Anghelina», «Анатолий» → «Anatolii»);
 * in Russian (or a Latin name) it is shown as stored.
 */
export function contactName(name: string, lang: ShopLang): string {
  if (lang !== "ro" || !/[а-яё]/i.test(name)) return name;
  const lower: string = name.toLowerCase();
  let out = "";
  for (let i = 0; i < lower.length; i++) {
    const ch: string = lower[i]!;
    const next: string = lower[i + 1] ?? "";
    let lat: string | undefined = CYR_TO_LAT[ch];
    if (lat == null) {
      out += name[i];
      continue;
    }
    // Romanian spelling: «ге/ги» → «ghe/ghi», «ке/ки» → «che/chi».
    if ((ch === "г" || ch === "к") && /[еиэ]/.test(next)) lat = ch === "г" ? "gh" : "ch";
    if (ch === "ч" && /[еи]/.test(next)) lat = "c";
    const upper: boolean = name[i] !== ch;
    out += upper ? lat.charAt(0).toUpperCase() + lat.slice(1) : lat;
  }
  return out;
}
