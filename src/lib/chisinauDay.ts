/**
 * Calendar-day bounds in the studio's time zone (Europe/Chisinau, UTC+2 / +3
 * in summer). Date filters send `YYYY-MM-DD`; the server runs in UTC, so
 * `new Date("YYYY-MM-DDT00:00:00")` would be UTC midnight and an order made at
 * 00:23 Chișinău would land on the previous day. DST-correct, pure.
 */
import { addDays, dayStart, isDayKey } from "@/lib/shop/report/period";

/** Instant 00:00 Chișinău of `day` (inclusive lower bound); null if not a valid `YYYY-MM-DD`. */
export function chisinauDayStart(day: string | null | undefined): Date | null {
  return isDayKey(day) ? dayStart(day) : null;
}

/**
 * Instant 00:00 Chișinău of the day after `day` (exclusive upper bound for an
 * inclusive `dateTo`); null if not a valid `YYYY-MM-DD`. Uses the next
 * calendar date, not +24 h, so 23/25-hour DST days are right.
 */
export function chisinauDayEndExclusive(day: string | null | undefined): Date | null {
  return isDayKey(day) ? dayStart(addDays(day, 1)) : null;
}
