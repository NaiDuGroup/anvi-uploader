import type { BusinessExpensePeriod } from "./types";

export type ExpenseForAccrual = {
  type: string;
  period: string;
  amount: number;
  isActive: boolean;
  startDate: Date;
  endDate: Date | null;
};

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function eachUtcDayKeyInclusive(fromIso: string, toIso: string): string[] {
  if (!fromIso || !toIso || fromIso > toIso) return [];
  const keys: string[] = [];
  let cur = new Date(`${fromIso}T12:00:00.000Z`);
  while (true) {
    const key = utcDateKey(cur);
    keys.push(key);
    if (key >= toIso) break;
    cur = new Date(cur.getTime() + 86400000);
  }
  return keys;
}

function daysInUtcMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function dayInExpenseRange(
  dayKey: string,
  start: Date,
  end: Date | null,
): boolean {
  const s = utcDateKey(start);
  const e = end ? utcDateKey(end) : null;
  if (dayKey < s) return false;
  if (e && dayKey > e) return false;
  return true;
}

/**
 * Accrual in MDL for this calendar day (may be fractional; callers round as needed).
 */
export function expenseDailyAccrual(
  e: ExpenseForAccrual,
  dayKey: string,
): number {
  if (!e.isActive || e.amount === 0) return 0;
  if (!dayInExpenseRange(dayKey, e.startDate, e.endDate)) return 0;

  const period = e.period as BusinessExpensePeriod;
  switch (period) {
    case "daily":
      return e.amount;
    case "monthly": {
      const [y, m] = dayKey.split("-").map(Number);
      const dim = daysInUtcMonth(y, m - 1);
      return dim > 0 ? e.amount / dim : 0;
    }
    case "yearly":
      return e.amount / 365;
    case "one_time":
      return utcDateKey(e.startDate) === dayKey ? e.amount : 0;
    default:
      return 0;
  }
}

export function sumExpensePoolForDay(
  expenses: readonly ExpenseForAccrual[],
  dayKey: string,
  bucket: "tax" | "nonTax",
): number {
  let sum = 0;
  for (const e of expenses) {
    const isTax = e.type === "tax";
    if (bucket === "tax" && !isTax) continue;
    if (bucket === "nonTax" && isTax) continue;
    sum += expenseDailyAccrual(e, dayKey);
  }
  return sum;
}

export function sumExpensePoolForPeriod(
  expenses: readonly ExpenseForAccrual[],
  fromIso: string,
  toIso: string,
  bucket: "tax" | "nonTax",
): number {
  let sum = 0;
  for (const day of eachUtcDayKeyInclusive(fromIso, toIso)) {
    sum += sumExpensePoolForDay(expenses, day, bucket);
  }
  return sum;
}

export function expenseTotalInPeriod(
  e: ExpenseForAccrual,
  fromIso: string,
  toIso: string,
): number {
  let s = 0;
  for (const day of eachUtcDayKeyInclusive(fromIso, toIso)) {
    s += expenseDailyAccrual(e, day);
  }
  return s;
}
