/**
 * e-Factura (SFS Moldova) integration types.
 *
 * The service is a SOAP/XML API (efactura-api.sfs.md). Access requires a
 * dedicated API user and a signed connection agreement with SFS. Signing and
 * sending invoices stays manual in the e-Factura web portal; this integration
 * is read-only (pull already-issued fiscal invoices).
 */

/** Fiscal lifecycle status codes returned by e-Factura (NOT payment status). */
export const EFACTURA_STATUS = {
  DRAFT: 0,
  SIGNED_SUPPLIER: 1,
  REJECTED_BUYER: 2,
  ACCEPTED_BUYER: 3,
  CANCELLED_SUPPLIER: 5,
  ARCHIVED: 6,
  SENT_TO_BUYER: 7,
  SIGNED_BUYER: 8,
  TRANSPORTED: 10,
} as const;

/**
 * Business buckets for UI. Live issued invoices split by buyer signature:
 * awaiting (sent) vs signed (completed / archive / accepted / transported).
 * Rejected/cancelled stay as dead buckets for rare rows we already know about.
 */
export type FiscalStatusBucket =
  | "draft"
  | "signed"
  | "awaiting_signature"
  | "rejected"
  | "cancelled";

/** Issued pool: same set as reconciliation acts (excludes draft / rejected / cancelled). */
export const ISSUED_EFACTURA_STATUSES: readonly number[] = [
  EFACTURA_STATUS.SIGNED_SUPPLIER,
  EFACTURA_STATUS.ACCEPTED_BUYER,
  EFACTURA_STATUS.ARCHIVED,
  EFACTURA_STATUS.SENT_TO_BUYER,
  EFACTURA_STATUS.SIGNED_BUYER,
  EFACTURA_STATUS.TRANSPORTED,
];

/** Buyer has signed / completed (portal «Завершённые» + archive + related). */
export const SIGNED_EFACTURA_STATUSES: readonly number[] = [
  EFACTURA_STATUS.ACCEPTED_BUYER,
  EFACTURA_STATUS.ARCHIVED,
  EFACTURA_STATUS.SIGNED_BUYER,
  EFACTURA_STATUS.TRANSPORTED,
];

/** Sent / waiting for buyer signature (portal «Отправлено»). */
export const AWAITING_SIGNATURE_EFACTURA_STATUSES: readonly number[] = [
  EFACTURA_STATUS.SIGNED_SUPPLIER,
  EFACTURA_STATUS.SENT_TO_BUYER,
];

export const FISCAL_STATUS_BUCKET_CODES: Record<FiscalStatusBucket, number[]> = {
  draft: [EFACTURA_STATUS.DRAFT],
  signed: [...SIGNED_EFACTURA_STATUSES],
  awaiting_signature: [...AWAITING_SIGNATURE_EFACTURA_STATUSES],
  rejected: [EFACTURA_STATUS.REJECTED_BUYER],
  cancelled: [EFACTURA_STATUS.CANCELLED_SUPPLIER],
};

/** Filter UI: signed vs awaiting (no dead statuses — we do not bulk-pull them). */
export const FISCAL_STATUS_FILTER_BUCKETS: Array<
  "signed" | "awaiting_signature"
> = ["signed", "awaiting_signature"];

export function fiscalStatusBucket(
  status: number,
): FiscalStatusBucket | "unknown" {
  if (status === EFACTURA_STATUS.DRAFT) return "draft";
  if (status === EFACTURA_STATUS.REJECTED_BUYER) return "rejected";
  if (status === EFACTURA_STATUS.CANCELLED_SUPPLIER) return "cancelled";
  if (AWAITING_SIGNATURE_EFACTURA_STATUSES.includes(status)) {
    return "awaiting_signature";
  }
  if (SIGNED_EFACTURA_STATUSES.includes(status)) return "signed";
  return "unknown";
}

/** Actor role in the e-Factura transaction. */
export const EFACTURA_ROLE = {
  SUPPLIER: 1,
  BUYER: 2,
  CARRIER: 3,
} as const;

/** Normalized fiscal invoice shape independent of the SOAP wire format. */
export interface EFacturaInvoice {
  seria: string;
  number: string;
  /** Fiscal status code (see EFACTURA_STATUS). */
  status: number;
  issueDate: string | null;
  totalAmount: string | null;
  vatAmount: string | null;
  currency: string;
  buyerName: string | null;
  buyerIdno: string | null;
  /**
   * Attached-document reference ("Путевой лист") from the invoice XML, e.g.
   * "B/f 0013 din data 09.07.2026 (card)". Only available via the per-invoice
   * XML pull (`getInvoiceBySeriaNumber`), not the list/CSV sources.
   */
  receiptRef?: string | null;
  /** True when `receiptRef` is a fiscal receipt (B/f): already paid at POS. */
  settledByReceipt?: boolean;
  receiptMethod?: "card" | "cash" | null;
  /** Receipt date (ISO) parsed from the reference, when present. */
  receiptDate?: string | null;
  /**
   * XML `<Redirections>` / creation reason (e.g. "Non-livrare"). Present when
   * the invoice was enriched from full XML.
   */
  redirections?: string | null;
  /** Original wire payload for audit / future fields. */
  raw: unknown;
}

export interface EFacturaSearchOptions {
  /** Exact e-Factura InvoiceStatus (e.g. 7 Sent, 8 Signed by buyer). */
  invoiceStatus: number;
  issuedFrom?: Date;
  issuedTo?: Date;
}

export interface EFacturaClient {
  /**
   * Fetches invoices where we are the supplier (accepted/issued). Used by the
   * periodic sync to mirror fiscal invoices into our database.
   */
  listSupplierInvoices(): Promise<EFacturaInvoice[]>;

  /**
   * Fetches a single invoice by series + number and returns it fully enriched
   * (buyer IDNO/name, amounts) by parsing the invoice document XML. Returns null
   * if not found. This is the reliable "pull-on-reference" path used when a bank
   * payment cites a fiscal invoice number.
   */
  getInvoiceBySeriaNumber(
    seria: string,
    number: string,
  ): Promise<EFacturaInvoice | null>;

  /**
   * Enumerates archived (historical) invoices where we are the supplier. This is
   * the only bulk-enumeration path available to the API user: it returns invoice
   * IDENTITY only (seria, number, status) — NOT buyer/amounts. Details are pulled
   * on demand via `getInvoiceBySeriaNumber`. Pages are fetched internally until
   * exhausted.
   */
  listArchivedInvoices(options?: {
    issuedFrom?: Date;
    issuedTo?: Date;
  }): Promise<EFacturaInvoice[]>;

  /**
   * `SearchInvoices` — identity list filtered by InvoiceStatus (+ optional
   * IssuedOn). Used to discover portal «Отправлено» / «Завершённые» that
   * `GetAcceptedInvoices` often omits. Still no buyer/amounts; enrich via XML.
   */
  searchInvoices?(options: EFacturaSearchOptions): Promise<EFacturaInvoice[]>;
}
