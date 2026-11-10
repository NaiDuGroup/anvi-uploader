import { describe, it, expect } from "vitest";
import { buildSettlementAct } from "./act";
import { ledgerTotals, parseSettlementPeriod, sliceLedger, withRunningBalance } from "./period";
import type { LedgerEntry, LedgerEntryKind } from "./types";

const e = (kind: LedgerEntryKind, date: string | null, amount: number, document: string = kind): Omit<LedgerEntry, "balance"> => ({
  kind,
  date,
  document,
  description: null,
  amount,
});

// Chișinău is UTC+2 in winter: 22:30Z on 31.12 is already 01.01 there.
const LEDGER: LedgerEntry[] = withRunningBalance([
  e("opening_balance", "2022-12-31T12:00:00.000Z", 1000),
  e("sale_invoice", "2025-03-01T10:00:00.000Z", 500, "EAA1"),
  e("payment_in", "2025-03-10T10:00:00.000Z", -800, "P1"),
  e("purchase_invoice", "2025-12-31T22:30:00.000Z", -300, "SUP1"),
  e("payment_out", "2026-01-05T10:00:00.000Z", 300, "D1"),
  e("card_payment_out", "2026-02-01T10:00:00.000Z", 50, "SHOP"),
  e("purchase_invoice", "2026-02-01T09:00:00.000Z", -50, "SUP2"),
  e("sale_invoice", "2026-06-01T10:00:00.000Z", 1200, "EAA2"),
  e("refund", "2026-06-02T10:00:00.000Z", 100, "R1"),
  e("receipt_out", "2026-07-01T10:00:00.000Z", 20, "SUP3"),
  e("purchase_invoice", "2026-07-01T10:00:00.000Z", -20, "SUP3"),
]);

describe("parseSettlementPeriod", () => {
  it("keeps valid days, drops junk and swaps reversed ends", () => {
    expect(parseSettlementPeriod("2026-01-01", "2026-12-31")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(parseSettlementPeriod("x", null)).toEqual({ from: null, to: null });
    expect(parseSettlementPeriod("2026-12-31", "2026-01-01")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("sliceLedger", () => {
  it("whole history: the 1C opening balance becomes the opening, not turnover", () => {
    const s = sliceLedger(LEDGER, { from: null, to: null });
    expect(s.opening).toBe(1000);
    expect(s.entries.some((x) => x.kind === "opening_balance")).toBe(false);
    expect(s.closing).toBe(LEDGER[LEDGER.length - 1]!.balance);
    expect(s.closing).toBe(2000);
    expect(s.entries[0]!.balance).toBe(1500);
  });

  it("opening = everything before `from` incl. the opening balance; closing at `to`", () => {
    const s = sliceLedger(LEDGER, { from: "2026-01-01", to: "2026-06-30" });
    // 1000 + 500 − 800 − 300 (SUP1 is 01.01.2026 in Chișinău → inside)
    expect(s.opening).toBe(700);
    expect(s.entries.map((x) => x.document)).toEqual(["SUP1", "D1", "SHOP", "SUP2", "EAA2", "R1"]);
    expect(s.closing).toBe(700 - 300 + 300 + 50 - 50 + 1200 + 100);
    expect(s.entries[s.entries.length - 1]!.balance).toBe(s.closing);
    expect(s.totals).toMatchObject({
      debit: 300 + 50 + 1200 + 100,
      credit: 300 + 50,
      salesInvoiced: 1200,
      received: -100,
      purchasesInvoiced: 350,
      paid: 350,
      paidByCard: 50,
      paidByReceipt: 0,
    });
  });

  it("open start with an end: opening includes the 1C balance, later entries excluded", () => {
    const s = sliceLedger(LEDGER, { from: null, to: "2025-12-31" });
    expect(s.opening).toBe(1000);
    expect(s.entries.map((x) => x.document)).toEqual(["EAA1", "P1"]);
    expect(s.closing).toBe(700);
  });

  it("a period before the opening date has no opening and keeps it out", () => {
    const s = sliceLedger(LEDGER, { from: "2020-01-01", to: "2021-12-31" });
    expect(s).toMatchObject({ opening: 0, closing: 0, entries: [] });
  });

  it("an opening balance dated inside the period is folded into the opening", () => {
    const s = sliceLedger(LEDGER, { from: "2022-01-01", to: "2025-12-30" });
    expect(s.opening).toBe(1000);
    expect(s.closing).toBe(700);
    expect(s.totals.debit - s.totals.credit).toBe(s.closing - s.opening);
  });

  it("undated entries only land in an open-ended period", () => {
    const ledger = withRunningBalance([e("sale_invoice", "2026-01-10T10:00:00Z", 10), e("payment_in", null, -10)]);
    expect(sliceLedger(ledger, { from: "2026-01-01", to: null }).closing).toBe(0);
    expect(sliceLedger(ledger, { from: "2026-01-01", to: "2026-12-31" }).closing).toBe(10);
  });

  it("totals skip opening rows", () => {
    expect(ledgerTotals(LEDGER.slice(0, 1))).toMatchObject({ debit: 0, credit: 0 });
  });
});

describe("buildSettlementAct", () => {
  it("turnover and closing add up; debt side follows the sign", () => {
    const s = sliceLedger(LEDGER, { from: "2026-01-01", to: "2026-12-31" });
    const act = buildSettlementAct(s);
    expect(act.opening).toBe(700);
    expect(act.debitTotal).toBe(300 + 50 + 1200 + 100 + 20);
    expect(act.creditTotal).toBe(300 + 50 + 20);
    expect(act.closing).toBe(act.opening + act.debitTotal - act.creditTotal);
    expect(act.closing).toBe(s.closing);
    expect(act.inFavourOf).toBe("us");
    expect(act.rows).toHaveLength(s.entries.length);
    expect(act.rows.every((r) => (r.debit === 0) !== (r.credit === 0))).toBe(true);
  });

  it("we owe them → in their favour; zero → none", () => {
    const owe = buildSettlementAct({ opening: -200, entries: withRunningBalance([e("purchase_invoice", "2026-01-02T10:00:00Z", -100)]) });
    expect(owe).toMatchObject({ closing: -300, inFavourOf: "them", debitTotal: 0, creditTotal: 100 });
    const zero = buildSettlementAct({ opening: 100, entries: withRunningBalance([e("payment_in", "2026-01-02T10:00:00Z", -100)]) });
    expect(zero).toMatchObject({ closing: 0, inFavourOf: "none" });
  });

  it("sums in cents (no float drift)", () => {
    const entries = withRunningBalance(Array.from({ length: 10 }, (_, i) => e("sale_invoice", `2026-01-${10 + i}T10:00:00Z`, 0.1)));
    const act = buildSettlementAct({ opening: 0.2, entries });
    expect(act.debitTotal).toBe(1);
    expect(act.closing).toBe(1.2);
  });
});
