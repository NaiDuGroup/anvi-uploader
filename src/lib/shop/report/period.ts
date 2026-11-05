/**
 * Report periods for the admin «Сайт» report: calendar days in the studio's
 * time zone (Europe/Chisinau), so «today» means the Chișinău day. Pure.
 */

export const SHOP_REPORT_TZ = "Europe/Chisinau";
/** Longest period one report request may cover (days). */
export const SHOP_REPORT_MAX_DAYS = 400;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(v: unknown): v is string {
  if (typeof v !== "string" || !DAY_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Offset of `tz` from UTC at `at`, in minutes (e.g. +120 / +180 for Chișinău). */
export function tzOffsetMinutes(at: Date, tz: string = SHOP_REPORT_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The instant a Chișinău calendar day starts. */
export function dayStart(day: string, tz: string = SHOP_REPORT_TZ): Date {
  const midnightUtc = new Date(`${day}T00:00:00.000Z`).getTime();
  const guess = midnightUtc - tzOffsetMinutes(new Date(`${day}T12:00:00.000Z`), tz) * 60000;
  // DST changes happen at night: re-check the offset at the guessed instant.
  const off = tzOffsetMinutes(new Date(guess), tz);
  return new Date(midnightUtc - off * 60000);
}

/** The Chișinău calendar day (YYYY-MM-DD) of an instant. */
export function dayKeyOf(at: Date, tz: string = SHOP_REPORT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function addDays(day: string, delta: number): string {
  return new Date(new Date(`${day}T12:00:00.000Z`).getTime() + delta * 86_400_000).toISOString().slice(0, 10);
}

/** Monday of the ISO week of `day`. */
export function weekKeyOf(day: string): string {
  const dow = new Date(`${day}T12:00:00.000Z`).getUTCDay();
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}

export function monthKeyOf(day: string): string {
  return day.slice(0, 7);
}

export type ShopReportGranularity = "day" | "week" | "month";

export function bucketKey(day: string, g: ShopReportGranularity): string {
  return g === "day" ? day : g === "week" ? weekKeyOf(day) : monthKeyOf(day);
}

export interface ShopReportPeriod {
  from: string;
  to: string;
  /** Inclusive start instant. */
  start: Date;
  /** Exclusive end instant (start of the day after `to`). */
  end: Date;
}

/**
 * `from` / `to` query values → the period, or an error code. Defaults: the
 * last 30 days up to today (Chișinău). `from > to` is swapped.
 */
export function parseShopReportPeriod(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  now: Date = new Date(),
): ShopReportPeriod | { error: "invalid_period" | "period_too_long" } {
  const today = dayKeyOf(now);
  let from = fromRaw ? fromRaw : addDays(today, -29);
  let to = toRaw ? toRaw : today;
  if (!isDayKey(from) || !isDayKey(to)) return { error: "invalid_period" };
  if (from > to) [from, to] = [to, from];
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  if (days > SHOP_REPORT_MAX_DAYS) return { error: "period_too_long" };
  return { from, to, start: dayStart(from), end: dayStart(addDays(to, 1)) };
}

/** Every bucket key of the period, in order (for charts with empty days). */
export function periodBuckets(from: string, to: string, g: ShopReportGranularity): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const k = bucketKey(d, g);
    if (out[out.length - 1] !== k) out.push(k);
  }
  return out;
}

/** One CSV cell; text starting with = + - @ gets a leading ' (formula injection). */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** `;`-separated CSV with a UTF-8 BOM (Excel opens Cyrillic correctly). */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
