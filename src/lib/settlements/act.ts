/**
 * «Акт сверки взаиморасчётов» (both sides) built from a period ledger. Pure:
 * the PDF only lays these numbers out.
 *
 *   Дебет  = entries that raise their debt to us (our invoices, our payments to them)
 *   Кредит = entries that lower it (their payments, their invoices to us)
 *   closing = opening + Σ debit − Σ credit
 */
import type { LedgerEntry, LedgerEntryKind } from "./types";
import type { LedgerSlice } from "./period";

export interface SettlementActRow {
  date: string | null;
  kind: LedgerEntryKind;
  document: string;
  description: string | null;
  debit: number;
  credit: number;
}

export interface SettlementAct {
  /** + they owe us. */
  opening: number;
  rows: SettlementActRow[];
  debitTotal: number;
  creditTotal: number;
  closing: number;
  /** Whose favour the closing balance is in. */
  inFavourOf: "us" | "them" | "none";
}

const cents = (n: number): number => Math.round(n * 100);

/** Keeps the act readable: bank purposes can be very long. */
function shortDescription(e: LedgerEntry): string | null {
  if (e.kind === "card_payment_out" || e.kind === "opening_balance") return null;
  const text = e.payerName?.trim() || e.description?.trim() || null;
  if (!text) return null;
  return text.length > 110 ? `${text.slice(0, 107)}…` : text;
}

export function buildSettlementAct(slice: Pick<LedgerSlice, "opening" | "entries">): SettlementAct {
  let debit = 0;
  let credit = 0;
  const rows: SettlementActRow[] = [];
  for (const e of slice.entries) {
    if (e.kind === "opening_balance") continue;
    const a = cents(e.amount);
    if (a === 0) continue;
    if (a > 0) debit += a;
    else credit -= a;
    rows.push({
      date: e.date,
      kind: e.kind,
      document: e.document,
      description: shortDescription(e),
      debit: a > 0 ? a / 100 : 0,
      credit: a < 0 ? -a / 100 : 0,
    });
  }
  const opening = cents(slice.opening);
  const closing = opening + debit - credit;
  return {
    opening: opening / 100,
    rows,
    debitTotal: debit / 100,
    creditTotal: credit / 100,
    closing: closing / 100,
    inFavourOf: closing > 0 ? "us" : closing < 0 ? "them" : "none",
  };
}
