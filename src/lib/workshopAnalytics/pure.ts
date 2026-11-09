/**
 * «Аналитика цеха» — pure helpers (no DB, client-safe). The heavy lifting is
 * done in Postgres (`server.ts`); these mirror its rules so they can be
 * unit-tested, and post-process the aggregated rows (reason texts → codes,
 * heatmap grid, slowest status).
 */
import { ISSUE_REASON_CODES, isIssueReasonCode, type IssueReasonCode } from "@/lib/issueReasonCode";

export const ANALYTICS_TZ = "Europe/Chisinau";

export interface DurationStats {
  count: number;
  /** Seconds; null when there is nothing to measure. */
  medianSec: number | null;
  p90Sec: number | null;
}

export const EMPTY_STATS: DurationStats = { count: 0, medianSec: null, p90Sec: null };

/**
 * Percentile with linear interpolation between closest ranks — the same as
 * Postgres `percentile_cont(p)`. `p` in [0, 1]. Null for an empty list.
 */
export function percentile(values: readonly number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (v.length === 0) return null;
  const q = Math.max(0, Math.min(1, p));
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo]! + (v[hi]! - v[lo]!) * (pos - lo);
}

export function durationStats(seconds: readonly number[]): DurationStats {
  return { count: seconds.length, medianSec: percentile(seconds, 0.5), p90Sec: percentile(seconds, 0.9) };
}

export interface StatusEvent {
  at: Date | number;
  /** Status before the change (`OrderLog.oldValue`). */
  from: string | null;
  /** Status after the change (`OrderLog.newValue`). */
  to: string;
}

export interface StatusSegment {
  status: string;
  startMs: number;
  endMs: number;
  durationSec: number;
  /** Still in this status (no later change): not counted in durations. */
  open: boolean;
}

/**
 * Time spent in each status of one order (or line) from its change log.
 * The first segment starts at `createdAt` (the order's creation) and runs to
 * the first change; each next one runs from a change to the following one.
 * The status of a closed segment is the change's `from` (what was really left),
 * falling back to the previous change's `to`. The last segment is `open`
 * (until `now`). Events are sorted by time; negative gaps count as 0.
 */
export function timeInStatusSegments(
  createdAt: Date | number,
  events: readonly StatusEvent[],
  now: Date | number = Date.now(),
  initialStatus = "NEW",
): StatusSegment[] {
  const ms = (d: Date | number) => (typeof d === "number" ? d : d.getTime());
  const sorted = events.slice().sort((a, b) => ms(a.at) - ms(b.at));
  const out: StatusSegment[] = [];
  let start = ms(createdAt);
  let current = initialStatus;
  for (const e of sorted) {
    const end = ms(e.at);
    const status = e.from ?? current;
    out.push({ status, startMs: start, endMs: end, durationSec: Math.max(0, (end - start) / 1000), open: false });
    start = end;
    current = e.to;
  }
  const end = ms(now);
  out.push({ status: current, startMs: start, endMs: end, durationSec: Math.max(0, (end - start) / 1000), open: true });
  return out;
}

/** Closed segments only, grouped by status → duration stats. */
export function statsByStatus(segments: readonly StatusSegment[]): Map<string, DurationStats> {
  const by = new Map<string, number[]>();
  for (const s of segments) {
    if (s.open) continue;
    const arr = by.get(s.status) ?? [];
    arr.push(s.durationSec);
    by.set(s.status, arr);
  }
  return new Map([...by].map(([k, v]) => [k, durationStats(v)]));
}

/** Final order status: its rare closed segments (reopened after delivery) are nonsense, not shown. */
export const FINAL_STATUSES: readonly string[] = ["DELIVERED"];

/**
 * Statuses where the order only waits for the client to pick it up — not
 * workshop / studio work. Shown with a «ждёт клиента» tag and never the
 * «дольше всего» status. Line production statuses (WAITING / NEEDS_LAYOUT /
 * PRINTING / DONE) have no such state.
 */
export const WAITING_CLIENT_STATUSES: readonly string[] = ["READY_IN_STUDIO", "RETURNED_TO_STUDIO"];

/** Terminal statuses without a meaningful duration bar. */
export const TERMINAL_STATUSES: readonly string[] = ["DELIVERED", "DONE"];

export function isWaitingClientStatus(status: string): boolean {
  return WAITING_CLIENT_STATUSES.includes(status);
}

/** Time-in-status rows to show: final statuses dropped. */
export function visibleStatusRows<T extends { status: string }>(rows: readonly T[]): T[] {
  return rows.filter((r) => !FINAL_STATUSES.includes(r.status));
}

/**
 * The status that holds work the longest: highest median among statuses with
 * at least `minCount` measurements, ignoring terminal ones and those that only
 * wait for the client (`exclude`).
 */
export function slowestStatus(
  rows: readonly ({ status: string } & DurationStats)[],
  minCount = 3,
  exclude: readonly string[] = [...TERMINAL_STATUSES, ...WAITING_CLIENT_STATUSES],
): string | null {
  let best: { status: string; median: number } | null = null;
  for (const r of rows) {
    if (exclude.includes(r.status) || r.count < minCount || r.medianSec == null) continue;
    if (!best || r.medianSec > best.median) best = { status: r.status, median: r.medianSec };
  }
  return best?.status ?? null;
}

export interface StaffRow {
  userId: string;
  name: string;
  role: string | null;
  statusChanges: number;
  lineChanges: number;
  flags: number;
}

/** Id of the merged row for log entries without a (still existing) user. */
export const UNKNOWN_USER_ID = "__unknown__";

/**
 * Staff activity rows: entries whose user is null or deleted (`known: false`)
 * merge into one {@link UNKNOWN_USER_ID} row (name filled by the UI); empty
 * rows dropped; sorted by total changes.
 */
export function mergeStaffRows(rows: readonly (StaffRow & { known: boolean })[]): StaffRow[] {
  const out: StaffRow[] = [];
  let unknown: StaffRow | null = null;
  for (const { known, ...r } of rows) {
    if (known) {
      out.push(r);
      continue;
    }
    if (!unknown) {
      unknown = { userId: UNKNOWN_USER_ID, name: "", role: null, statusChanges: 0, lineChanges: 0, flags: 0 };
      out.push(unknown);
    }
    unknown.statusChanges += r.statusChanges;
    unknown.lineChanges += r.lineChanges;
    unknown.flags += r.flags;
  }
  const total = (r: StaffRow) => r.statusChanges + r.lineChanges + r.flags;
  return out.filter((r) => total(r) > 0).sort((a, b) => total(b) - total(a));
}

/** ISO weekday (0 = Monday … 6 = Sunday) and hour (0–23) of an instant in Chișinău. */
export function chisinauWeekdayHour(at: Date, tz: string = ANALYTICS_TZ): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
  return { weekday: weekday < 0 ? 0 : weekday, hour };
}

/** 7 × 24 grid (rows Monday…Sunday, columns hours) from `(isodow 1–7, hour, count)` rows. */
export function heatmapGrid(rows: readonly { isodow: number; hour: number; count: number }[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const r of rows) {
    const d = r.isodow - 1;
    if (d < 0 || d > 6 || r.hour < 0 || r.hour > 23) continue;
    grid[d]![r.hour]! += r.count;
  }
  return grid;
}

function normText(s: string): string {
  return s.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/** Label sets per code, any locale: `{ fileCorrupt: ["Файл не открывается…", "File won't open…"] }`. */
export type ReasonLabelSets = Partial<Record<IssueReasonCode, readonly string[]>>;

/**
 * Old ISSUE rows hold only the localized label (or a free text): map a known
 * label of any locale back to its key; anything else is «другое / свой текст»
 * (`other`, `custom: true`). A stored code wins.
 */
export function issueReasonCodeFromText(
  text: string | null | undefined,
  labels: ReasonLabelSets,
  storedCode?: string | null,
): { code: IssueReasonCode; custom: boolean } {
  if (isIssueReasonCode(storedCode)) {
    const custom = storedCode === "other" && !!text && !matchesLabel(text, labels.other ?? []);
    return { code: storedCode, custom };
  }
  const t = normText(text ?? "");
  if (t) {
    for (const code of ISSUE_REASON_CODES) {
      if (matchesLabel(t, labels[code] ?? [])) return { code, custom: false };
    }
  }
  return { code: "other", custom: t.length > 0 };
}

function matchesLabel(text: string, labels: readonly string[]): boolean {
  const t = normText(text);
  return labels.some((l) => normText(l) === t);
}

/** ISSUE reason keys that mean the file itself is the problem. */
export const FILE_REASON_CODES: readonly IssueReasonCode[] = ["fileCorrupt", "wrongFormat", "lowQuality", "missingPages"];

/**
 * «Проблема» split: «из-за файла» when a line was flagged «Проблема с файлом»
 * or any ISSUE reason maps to a file key; otherwise «другое» (own text such as
 * «нет красных ручек», customer requests, no reason).
 */
export function problemKind(
  order: { hadFlag: boolean; reasons: readonly { text: string | null; code: string | null }[] },
  labels: ReasonLabelSets,
): "file" | "other" {
  if (order.hadFlag) return "file";
  for (const r of order.reasons) {
    if (FILE_REASON_CODES.includes(issueReasonCodeFromText(r.text, labels, r.code).code)) return "file";
  }
  return "other";
}

export interface FlagEvent {
  lineId: string;
  at: Date | number;
  kind: "flagged" | "fixed" | "cleared" | "replaced";
}

/**
 * «Проблема с файлом» on lines: each flag paired with the next fix / clear /
 * replace of the same line → seconds to resolve. Unresolved flags are skipped.
 */
export function flagResolveSeconds(events: readonly FlagEvent[]): number[] {
  const ms = (d: Date | number) => (typeof d === "number" ? d : d.getTime());
  const byLine = new Map<string, FlagEvent[]>();
  for (const e of events) {
    const arr = byLine.get(e.lineId) ?? [];
    arr.push(e);
    byLine.set(e.lineId, arr);
  }
  const out: number[] = [];
  for (const arr of byLine.values()) {
    arr.sort((a, b) => ms(a.at) - ms(b.at));
    let open: number | null = null;
    for (const e of arr) {
      if (e.kind === "flagged") {
        if (open == null) open = ms(e.at);
      } else if (open != null) {
        out.push(Math.max(0, (ms(e.at) - open) / 1000));
        open = null;
      }
    }
  }
  return out;
}

/** Board section of a line: UV-DTF (UV technique «transfer») apart from direct UV. */
export function analyticsSectionKey(productType: string, uvTechnique?: string | null): string {
  return productType === "uv_print" && uvTechnique === "transfer" ? "uv_dtf" : productType;
}

export interface DurationUnits {
  d: string;
  h: string;
  m: string;
}

/** «3 д 4 ч», «2 ч 15 мин», «12 мин», «<1 мин»; «—» for null. */
export function formatDurationSec(sec: number | null | undefined, u: DurationUnits): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const totalMin = Math.round(sec / 60);
  if (totalMin < 1) return `<1 ${u.m}`;
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days} ${u.d} ${hours} ${u.h}` : `${days} ${u.d}`;
  if (hours > 0) return mins > 0 ? `${hours} ${u.h} ${mins} ${u.m}` : `${hours} ${u.h}`;
  return `${mins} ${u.m}`;
}

/** Share 0–1 (0 when the base is empty). */
export function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}
