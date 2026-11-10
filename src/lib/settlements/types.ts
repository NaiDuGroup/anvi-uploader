/**
 * «Взаиморасчёты» DTOs shared by the API and the admin screen (no Prisma).
 * Amounts are MDL numbers rounded to cents. Sign convention everywhere:
 * positive = the counterparty owes us, negative = we owe them.
 */

export const COUNTERPARTY_CATEGORIES = [
  "supplier",
  "customer",
  "tax",
  "own",
  "bank",
  "staff",
  "courier",
  "other",
] as const;

export type CounterpartyCategoryCode = (typeof COUNTERPARTY_CATEGORIES)[number];

export function isCounterpartyCategory(v: unknown): v is CounterpartyCategoryCode {
  return typeof v === "string" && (COUNTERPARTY_CATEGORIES as readonly string[]).includes(v);
}

/**
 * Where the category comes from: set by hand, built-in default, guessed from
 * invoices, or an operational IDNO from «Сверка → Не клиенты».
 */
export type CategorySource = "manual" | "default" | "auto" | "operational";

export type SettlementState =
  /** Client owes us (sales side open). */
  | "they_owe"
  /** We owe a supplier (purchase side open). */
  | "we_owe"
  /** We paid a supplier more than they invoiced. */
  | "we_overpaid"
  /** A client paid more than we invoiced. */
  | "they_overpaid"
  | "settled"
  /** No invoices either way and no category — the owner should classify. */
  | "unclassified"
  /** Taxes, own accounts, bank, staff, courier — not a trading party. */
  | "service";

export type SettlementFlagKind =
  /** Two equal sales invoices within 90 days but only one payment of that amount. */
  | "duplicate_sale"
  /** Incoming payment with no sales invoice ±60 days while the client is in credit. */
  | "payment_without_invoice"
  /** Paid to a supplier more than they invoiced. */
  | "supplier_overpaid"
  /** Same amount paid to a supplier twice within 30 days, one invoice of that amount. */
  | "duplicate_payment";

export interface SettlementFlag {
  kind: SettlementFlagKind;
  amount: number;
  /** ISO dates of the documents / payments involved. */
  dates: string[];
  /** Invoice numbers or payment document numbers involved. */
  documents: string[];
}

export interface SettlementRow {
  idno: string;
  name: string;
  category: CounterpartyCategoryCode | null;
  categorySource: CategorySource | null;
  /** Our sales invoices (+ pre-e-Factura settlements), as in «Должники». */
  salesInvoiced: number;
  /** Money they paid us (third-party payers attributed, refunds deducted, B/f receipts). */
  receivedFromThem: number;
  /** Their (supplier) invoices to us. */
  purchasesInvoiced: number;
  /** Our transfers to them (TD=1, refunds excluded) + card purchases + B/f receipts. */
  paidToThem: number;
  /** Part of paidToThem paid by company card (attributed card purchases). */
  paidByCard: number;
  /** Part of paidToThem: their invoices paid on the spot by fiscal receipt (B/f). */
  paidByReceipt: number;
  /** salesInvoiced − receivedFromThem; > 0 they owe, < 0 they overpaid. */
  salesNet: number;
  /** purchasesInvoiced − paidToThem; > 0 we owe, < 0 we overpaid. */
  purchaseNet: number;
  /** Carried-over balance from before (1C), + they owe us; 0 when none. */
  openingBalance: number;
  /** openingBalance + salesNet − purchaseNet. */
  balance: number;
  state: SettlementState;
  flags: SettlementFlag[];
  salesInvoiceCount: number;
  purchaseInvoiceCount: number;
  lastActivity: string | null;
}

export interface SettlementSummary {
  theyOwe: number;
  theyOweCount: number;
  weOwe: number;
  weOweCount: number;
  weOverpaid: number;
  weOverpaidCount: number;
  theyOverpaid: number;
  theyOverpaidCount: number;
  checkCount: number;
  unclassifiedCount: number;
  serviceCount: number;
  /** Purchase invoices still waiting for totals (backfill in progress). */
  purchasesWithoutTotals: number;
}

export type CardMerchantSource = "alias" | "ignored" | "name" | "amount" | "mixed" | null;

/** Card purchases of one merchant (grouped by the normalized merchant key). */
export interface CardMerchantGroup {
  merchantKey: string;
  /** Latest merchant spelling from the bank. */
  merchantRaw: string;
  count: number;
  sum: number;
  lastDate: string;
  /** Purchases of this merchant attributed to a supplier. */
  attributedCount: number;
  attributedSum: number;
  /** Supplier when all attributed purchases go to one IDNO (alias / name). */
  idno: string | null;
  idnoName: string | null;
  source: CardMerchantSource;
}

export interface CardPaymentsSummary {
  attributedCount: number;
  attributedSum: number;
  unattributedCount: number;
  unattributedSum: number;
  /** Marked «Не поставщик» (stay bank rows). */
  ignoredCount: number;
  ignoredSum: number;
  byAmountCount: number;
  merchants: CardMerchantGroup[];
}

export interface SettlementsResponse {
  rows: SettlementRow[];
  summary: SettlementSummary;
  cardPayments: CardPaymentsSummary;
  generatedAt: string;
}

export type LedgerEntryKind =
  /** Balance carried over from before (1C), set by hand on the card. */
  | "opening_balance"
  | "sale_invoice"
  | "payment_in"
  | "receipt"
  | "historical_invoice"
  | "refund"
  | "purchase_invoice"
  | "payment_out"
  /** Company-card purchase attributed to this supplier. */
  | "card_payment_out"
  /** Their invoice paid on the spot by fiscal receipt (B/f). */
  | "receipt_out";

export interface LedgerEntry {
  kind: LedgerEntryKind;
  date: string | null;
  document: string;
  description: string | null;
  /** Signed effect on the balance: + they owe more, − we owe more. */
  amount: number;
  /** Running balance after this entry. */
  balance: number;
  /** Third-party payer for an incoming payment. */
  payerName?: string | null;
  /** receipt_out: "card" | "cash" | null. */
  receiptMethod?: string | null;
  /** card_payment_out: how it was attributed. */
  cardSource?: "alias" | "name" | "amount" | null;
}

export interface OpeningBalanceDto {
  /** YYYY-MM-DD. */
  asOfDate: string;
  amount: number;
  note: string | null;
  updatedAt: string;
}

/** Inclusive calendar days (Chișinău), YYYY-MM-DD; null = open end. */
export interface SettlementPeriod {
  from: string | null;
  to: string | null;
}

/** Turnover inside a period (opening balance row excluded). */
export interface SettlementPeriodTotals {
  /** Sum of entries that raise their debt to us. */
  debit: number;
  /** Sum of entries that lower it (as a positive number). */
  credit: number;
  /** Our invoices (e-Factura + paper), «выставлено нами». */
  salesInvoiced: number;
  /** Their payments to us, refunds deducted. */
  received: number;
  /** Their invoices to us. */
  purchasesInvoiced: number;
  /** Our payments to them: bank + card + B/f. */
  paid: number;
  paidByCard: number;
  paidByReceipt: number;
}

export interface SettlementLedgerResponse {
  idno: string;
  name: string;
  category: CounterpartyCategoryCode | null;
  categorySource: CategorySource | null;
  /** All entries (or the period's), chronological, running balance from `opening`. */
  entries: LedgerEntry[];
  /** Balance today (all entries). */
  balance: number;
  period: SettlementPeriod;
  /** Balance before the period start (0 without `from`). */
  opening: number;
  /** Balance after the period end. */
  closing: number;
  totals: SettlementPeriodTotals;
  openingBalance: OpeningBalanceDto | null;
  /** First document date (ISO), to warn when the opening date is after it. */
  firstDocumentDate: string | null;
}
