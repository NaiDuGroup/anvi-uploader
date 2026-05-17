import { describe, it, expect } from "vitest";
import type { ExpenseForAccrual } from "./expenseAccrual";
import {
  eachUtcDayKeyInclusive,
  expenseDailyAccrual,
  sumExpensePoolForDay,
  sumExpensePoolForPeriod,
  expenseTotalInPeriod,
} from "./expenseAccrual";

function exp(partial: Partial<ExpenseForAccrual> & Pick<ExpenseForAccrual, "type" | "period" | "amount">): ExpenseForAccrual {
  return {
    isActive: true,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: null,
    ...partial,
  };
}

describe("eachUtcDayKeyInclusive", () => {
  it("returns consecutive UTC day keys", () => {
    expect(eachUtcDayKeyInclusive("2026-01-01", "2026-01-03")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it("returns empty for invalid range", () => {
    expect(eachUtcDayKeyInclusive("", "2026-01-01")).toEqual([]);
    expect(eachUtcDayKeyInclusive("2026-02-01", "2026-01-01")).toEqual([]);
  });
});

describe("expenseDailyAccrual", () => {
  it("returns 0 when inactive or zero amount", () => {
    expect(
      expenseDailyAccrual(
        exp({ type: "rent", period: "daily", amount: 10, isActive: false }),
        "2026-01-01",
      ),
    ).toBe(0);
    expect(
      expenseDailyAccrual(
        exp({ type: "rent", period: "daily", amount: 0 }),
        "2026-01-01",
      ),
    ).toBe(0);
  });

  it("daily period returns full amount", () => {
    expect(
      expenseDailyAccrual(
        exp({ type: "rent", period: "daily", amount: 25 }),
        "2026-01-15",
      ),
    ).toBe(25);
  });

  it("monthly splits by days in UTC month", () => {
    // January 2026 has 31 days
    const e = exp({ type: "rent", period: "monthly", amount: 310 });
    const daily = expenseDailyAccrual(e, "2026-01-15");
    expect(daily).toBeCloseTo(310 / 31, 8);
  });

  it("yearly splits by 365", () => {
    const e = exp({ type: "equipment_depreciation", period: "yearly", amount: 3650 });
    expect(expenseDailyAccrual(e, "2026-06-01")).toBe(10);
  });

  it("one_time accrues only on start date", () => {
    const e = exp({
      type: "other",
      period: "one_time",
      amount: 500,
      startDate: new Date("2026-03-10T00:00:00.000Z"),
    });
    expect(expenseDailyAccrual(e, "2026-03-10")).toBe(500);
    expect(expenseDailyAccrual(e, "2026-03-11")).toBe(0);
  });

  it("returns 0 outside start/end range", () => {
    const e = exp({
      type: "rent",
      period: "daily",
      amount: 5,
      endDate: new Date("2026-01-05T23:59:59.999Z"),
    });
    expect(expenseDailyAccrual(e, "2026-01-05")).toBe(5);
    expect(expenseDailyAccrual(e, "2026-01-06")).toBe(0);
    expect(expenseDailyAccrual(e, "2025-12-31")).toBe(0);
  });
});

describe("sumExpensePoolForDay", () => {
  it("separates tax vs non-tax buckets", () => {
    const expenses: ExpenseForAccrual[] = [
      exp({ type: "tax", period: "daily", amount: 20 }),
      exp({ type: "rent", period: "daily", amount: 30 }),
    ];
    expect(sumExpensePoolForDay(expenses, "2026-01-01", "tax")).toBe(20);
    expect(sumExpensePoolForDay(expenses, "2026-01-01", "nonTax")).toBe(30);
  });
});

describe("sumExpensePoolForPeriod and expenseTotalInPeriod", () => {
  it("aggregates daily accrual across interval", () => {
    const e = exp({ type: "rent", period: "daily", amount: 10 });
    expect(sumExpensePoolForPeriod([e], "2026-01-01", "2026-01-03", "nonTax")).toBe(30);
    expect(expenseTotalInPeriod(e, "2026-01-01", "2026-01-03")).toBe(30);
  });
});
