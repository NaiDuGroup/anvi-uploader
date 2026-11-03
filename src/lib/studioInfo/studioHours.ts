import { WEEKDAYS, type StudioInterval, type Weekday } from "./studioInfo";

/**
 * Opening-hours maths for the footer: live status in the studio's time zone
 * (not the browser's) and a compact week summary. Pure — the caller passes `now`.
 */

export type WeekHours = Record<Weekday, StudioInterval[]>;

export type StudioStatus =
  | { kind: "open"; until: string }
  | { kind: "lunch"; until: string }
  | { kind: "closed"; opensDay: Weekday | null; opensIn: "today" | "tomorrow" | "later"; opensAt: string };

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** `09:00` → `9:00`. */
export function displayTime(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${Number(h)}:${m}`;
}

function sorted(list: StudioInterval[]): StudioInterval[] {
  return [...list].filter((i) => toMin(i.to) > toMin(i.from)).sort((a, b) => toMin(a.from) - toMin(b.from));
}

const EN_WEEKDAY: Record<string, Weekday> = {
  Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun",
};

/** Weekday + minutes since midnight of `now` in `timeZone`. */
export function zonedNow(now: Date, timeZone: string): { day: Weekday; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return zonedNow(now, "Europe/Chisinau");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = EN_WEEKDAY[get("weekday")] ?? "mon";
  const hour = Number(get("hour")) % 24;
  return { day, minutes: hour * 60 + Number(get("minute")) };
}

export function studioStatus(hours: WeekHours, now: Date, timeZone: string): StudioStatus {
  const { day, minutes } = zonedNow(now, timeZone);
  const today = sorted(hours[day] ?? []);

  const current = today.find((i) => minutes >= toMin(i.from) && minutes < toMin(i.to));
  if (current) return { kind: "open", until: today[today.length - 1]!.to };

  const nextToday = today.find((i) => toMin(i.from) > minutes);
  if (nextToday) {
    const startedToday = today.some((i) => toMin(i.to) <= minutes);
    if (startedToday) return { kind: "lunch", until: nextToday.from };
    return { kind: "closed", opensDay: day, opensIn: "today", opensAt: nextToday.from };
  }

  const idx = WEEKDAYS.indexOf(day);
  for (let step = 1; step <= 7; step++) {
    const d = WEEKDAYS[(idx + step) % 7]!;
    const first = sorted(hours[d] ?? [])[0];
    if (first) {
      return { kind: "closed", opensDay: d, opensIn: step === 1 ? "tomorrow" : "later", opensAt: first.from };
    }
  }
  return { kind: "closed", opensDay: null, opensIn: "later", opensAt: "" };
}

export interface HoursSummaryRow {
  /** First and last weekday of a run of days with the same hours. */
  fromDay: Weekday;
  toDay: Weekday;
  /** `null` = closed. */
  span: { from: string; to: string } | null;
}

/**
 * Week as runs of equal days (`Пн–Пт 9:00–18:00 · Сб 10:00–15:00 · Вс выходной`)
 * plus the break, when every working day shares the same one.
 */
export function hoursSummary(hours: WeekHours): { rows: HoursSummaryRow[]; lunch: { from: string; to: string } | null } {
  const key = (d: Weekday) => JSON.stringify(sorted(hours[d] ?? []));
  const rows: HoursSummaryRow[] = [];
  for (const d of WEEKDAYS) {
    const last = rows[rows.length - 1];
    if (last && key(last.toDay) === key(d)) {
      last.toDay = d;
      continue;
    }
    const list = sorted(hours[d] ?? []);
    rows.push({
      fromDay: d,
      toDay: d,
      span: list.length ? { from: list[0]!.from, to: list[list.length - 1]!.to } : null,
    });
  }

  const gaps = new Set<string>();
  let workingDays = 0;
  for (const d of WEEKDAYS) {
    const list = sorted(hours[d] ?? []);
    if (!list.length) continue;
    workingDays++;
    if (list.length !== 2) return { rows, lunch: null };
    gaps.add(`${list[0]!.to}-${list[1]!.from}`);
  }
  const only = gaps.size === 1 && workingDays > 0 ? [...gaps][0]!.split("-") : null;
  return { rows, lunch: only ? { from: only[0]!, to: only[1]! } : null };
}

/** `9:00-12:30, 13:10-18:00` ↔ intervals, for the settings form. */
export function formatIntervals(list: StudioInterval[]): string {
  return sorted(list).map((i) => `${displayTime(i.from)}–${displayTime(i.to)}`).join(", ");
}

export function parseIntervals(text: string): StudioInterval[] | null {
  const t = text.trim();
  if (!t) return [];
  const out: StudioInterval[] = [];
  for (const chunk of t.split(/[,;]/)) {
    const m = /^\s*(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})\s*$/.exec(chunk);
    if (!m) return null;
    const [h1, m1, h2, m2] = [m[1], m[2], m[3], m[4]].map(Number) as [number, number, number, number];
    if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    const from = `${pad(h1)}:${pad(m1)}`;
    const to = `${pad(h2)}:${pad(m2)}`;
    if (toMin(to) <= toMin(from)) return null;
    out.push({ from, to });
  }
  return sorted(out);
}
