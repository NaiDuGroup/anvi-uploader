/**
 * «Взаиморасчёты» card: a counterparty ledger cut to a period. Pure.
 *
 *   opening = sum of entries dated before `from` + the 1C opening balance
 *             (unless that is dated after `to`)
 *   closing = opening + debit − credit of the entries inside the period
 *
 * Days are Chișinău calendar days (`YYYY-MM-DD`, both ends inclusive).
 * Entries without a date sort last and only fall inside an open-ended period.
 */
import { dayKeyOf, isDayKey } from "@/lib/shop/report/period";
import type {
  LedgerEntry,
  LedgerEntryKind,
  SettlementPeriod,
  SettlementPeriodTotals,
} from "./types";

const cents = (n: number): number => Math.round(n * 100);
const mdl = (c: number): number => c / 100;

const SALES_INVOICE_KINDS: ReadonlySet<LedgerEntryKind> = new Set(["sale_invoice", "historical_invoice"]);
const RECEIVED_KINDS: ReadonlySet<LedgerEntryKind> = new Set(["payment_in", "receipt"]);
const PAID_KINDS: ReadonlySet<LedgerEntryKind> = new Set(["payment_out", "card_payment_out", "receipt_out"]);

/** Validates `from` / `to` query values; swaps them when given in reverse. */
export function parseSettlementPeriod(from: unknown, to: unknown): SettlementPeriod {
  let f = isDayKey(from) ? from : null;
  let t = isDayKey(to) ? to : null;
  if (f && t && f > t) [f, t] = [t, f];
  return { from: f, to: t };
}

/** Chișinău day of an entry, null when undated. */
export function entryDay(e: Pick<LedgerEntry, "date">): string | null {
  if (!e.date) return null;
  const d = new Date(e.date);
  return Number.isNaN(d.getTime()) ? null : dayKeyOf(d);
}

/** Where an entry falls relative to the period. */
function position(e: LedgerEntry, period: SettlementPeriod): "before" | "inside" | "after" {
  const day = entryDay(e);
  if (day === null) return period.to ? "after" : "inside";
  if (period.from && day < period.from) return "before";
  if (period.to && day > period.to) return "after";
  return "inside";
}

export function emptyTotals(): SettlementPeriodTotals {
  return {
    debit: 0,
    credit: 0,
    salesInvoiced: 0,
    received: 0,
    purchasesInvoiced: 0,
    paid: 0,
    paidByCard: 0,
    paidByReceipt: 0,
  };
}

/** Turnover of entries (opening balance rows are not turnover). */
export function ledgerTotals(entries: readonly LedgerEntry[]): SettlementPeriodTotals {
  const c = {
    debit: 0,
    credit: 0,
    salesInvoiced: 0,
    received: 0,
    purchasesInvoiced: 0,
    paid: 0,
    paidByCard: 0,
    paidByReceipt: 0,
  };
  for (const e of entries) {
    if (e.kind === "opening_balance") continue;
    const a = cents(e.amount);
    if (a > 0) c.debit += a;
    else c.credit -= a;
    if (SALES_INVOICE_KINDS.has(e.kind)) c.salesInvoiced += a;
    else if (RECEIVED_KINDS.has(e.kind)) c.received -= a;
    else if (e.kind === "refund") c.received -= a;
    else if (e.kind === "purchase_invoice") c.purchasesInvoiced -= a;
    else if (PAID_KINDS.has(e.kind)) {
      c.paid += a;
      if (e.kind === "card_payment_out") c.paidByCard += a;
      if (e.kind === "receipt_out") c.paidByReceipt += a;
    }
  }
  return {
    debit: mdl(c.debit),
    credit: mdl(c.credit),
    salesInvoiced: mdl(c.salesInvoiced),
    received: mdl(c.received),
    purchasesInvoiced: mdl(c.purchasesInvoiced),
    paid: mdl(c.paid),
    paidByCard: mdl(c.paidByCard),
    paidByReceipt: mdl(c.paidByReceipt),
  };
}

/** Running balance from `start` over chronological entries. */
export function withRunningBalance<T extends Omit<LedgerEntry, "balance">>(
  entries: readonly T[],
  start = 0,
): Array<T & { balance: number }> {
  let running = cents(start);
  return entries.map((e) => {
    running += cents(e.amount);
    return { ...e, balance: mdl(running) };
  });
}

export interface LedgerSlice {
  opening: number;
  closing: number;
  entries: LedgerEntry[];
  totals: SettlementPeriodTotals;
}

/** Cuts a chronological ledger to the period and recomputes running balances. */
export function sliceLedger(entries: readonly LedgerEntry[], period: SettlementPeriod): LedgerSlice {
  let opening = 0;
  const inside: LedgerEntry[] = [];
  for (const e of entries) {
    let pos = position(e, period);
    // A carried-over balance is never turnover: inside the period it becomes the opening.
    if (e.kind === "opening_balance" && pos === "inside") pos = "before";
    if (pos === "before") opening += cents(e.amount);
    else if (pos === "inside") inside.push(e);
  }
  const rebalanced = withRunningBalance(inside, mdl(opening));
  const closing = opening + inside.reduce((s, e) => s + cents(e.amount), 0);
  return {
    opening: mdl(opening),
    closing: mdl(closing),
    entries: rebalanced,
    totals: ledgerTotals(inside),
  };
}

/**
 * First day the act subtitle names («за период с … по …») when the period has
 * no explicit start: the earliest entry day, or the 1C opening balance date if
 * that is earlier — but the opening only counts when it is actually included
 * (dated on/before `to`; one dated after `to` is left out of the slice).
 */
export function actPeriodStart(
  period: SettlementPeriod,
  entries: readonly Pick<LedgerEntry, "date">[],
  openingAsOf: string | null,
): string | null {
  if (period.from) return period.from;
  let first: string | null = null;
  for (const e of entries) {
    const day = entryDay(e);
    if (day && (first === null || day < first)) first = day;
  }
  const openingIncluded = !!openingAsOf && (!period.to || openingAsOf <= period.to);
  if (openingIncluded && (first === null || openingAsOf! < first)) return openingAsOf;
  return first;
}
