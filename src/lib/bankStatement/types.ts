/** Normalized, bank-agnostic transaction produced by a statement parser. */
export interface NormalizedTransaction {
  /** Posting date (bank booking date). */
  bookingDate: Date;
  /** Value date if the format provides a distinct one. */
  valueDate: Date | null;
  /** CREDIT = money into our account (incoming), DEBIT = money out. */
  direction: "CREDIT" | "DEBIT";
  /** Amount as a fixed 2-dp decimal string (e.g. "584.00"). Always positive. */
  amount: string;
  currency: string;
  counterpartyName: string | null;
  /** Fiscal code (IDNO) of the counterparty (payer for CREDIT). */
  counterpartyIdno: string | null;
  counterpartyIban: string | null;
  /** Full payment purpose ("destinația plății"). */
  purpose: string | null;
  documentNumber: string | null;
  /** Bank-side reference used for dedupe/audit. */
  bankRef: string | null;
  /** Bank transaction-type code (MAIB "TD"). */
  txTypeCode: string | null;
  /** Stable fingerprint for idempotent re-import. */
  dedupeKey: string;
}

export interface ParseWarning {
  /** 1-based source line number. */
  line: number;
  message: string;
}

export interface ParsedStatement {
  accountIban: string | null;
  /** Opening balance ("sold initial") from the statement header, 2-dp string. */
  openingBalance: string | null;
  periodFrom: Date | null;
  periodTo: Date | null;
  currency: string;
  transactions: NormalizedTransaction[];
  warnings: ParseWarning[];
}

export interface ParseOptions {
  /** Our own supplier fiscal code, used to pick the counterparty side. */
  ourFiscalCode?: string;
  /** Our own account IBAN (fallback when the file omits it). */
  ourIban?: string;
}
