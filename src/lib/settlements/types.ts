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
  /** Our transfers to them (TD=1), refunds excluded. */
  paidToThem: number;
  /** salesInvoiced − receivedFromThem; > 0 they owe, < 0 they overpaid. */
  salesNet: number;
  /** purchasesInvoiced − paidToThem; > 0 we owe, < 0 we overpaid. */
  purchaseNet: number;
  /** salesNet − purchaseNet. */
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

export interface SettlementsResponse {
  rows: SettlementRow[];
  summary: SettlementSummary;
  generatedAt: string;
}

export type LedgerEntryKind =
  | "sale_invoice"
  | "payment_in"
  | "receipt"
  | "historical_invoice"
  | "refund"
  | "purchase_invoice"
  | "payment_out";

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
}

export interface SettlementLedgerResponse {
  idno: string;
  name: string;
  entries: LedgerEntry[];
  balance: number;
}
