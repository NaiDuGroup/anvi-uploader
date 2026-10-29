/** Import shipments («Склад → Импорт»): fixed lists stored as plain strings. */

export const IMPORT_STATUSES = ["ordered", "in_transit", "customs", "received", "posted"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_DOCUMENT_KINDS = [
  "proforma",
  "invoice",
  "declaration",
  "broker_invoice",
  "payment",
  "awb",
  "correspondence",
  "other",
] as const;
export type ImportDocumentKind = (typeof IMPORT_DOCUMENT_KINDS)[number];

/**
 * Documents every import must end up with. «proforma» or «invoice» satisfies
 * the supplier-document requirement. A broker invoice is optional: the broker
 * is usually paid by a plain bank transfer.
 */
export const REQUIRED_IMPORT_DOCUMENTS = ["supplier_document", "declaration", "payment"] as const;
export type RequiredImportDocument = (typeof REQUIRED_IMPORT_DOCUMENTS)[number];

export const IMPORT_COST_KINDS = ["supplier_payment", "bank_fee", "customs", "broker", "freight", "other"] as const;
export type ImportCostKind = (typeof IMPORT_COST_KINDS)[number];

/** Costs that make up the purchase price of the goods (before customs and services). */
export const PURCHASE_COST_KINDS: readonly ImportCostKind[] = ["supplier_payment", "bank_fee"];

export const IMPORT_POSTING_MODES = ["normal", "historical"] as const;
export type ImportPostingMode = (typeof IMPORT_POSTING_MODES)[number];

/** Documents up to this size; uploaded straight to storage (presigned PUT). */
export const IMPORT_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;

export function isImportStatus(v: unknown): v is ImportStatus {
  return typeof v === "string" && (IMPORT_STATUSES as readonly string[]).includes(v);
}

/** Required documents not uploaded yet. */
export function missingImportDocuments(kinds: readonly string[]): RequiredImportDocument[] {
  const has = new Set(kinds);
  return REQUIRED_IMPORT_DOCUMENTS.filter((req) =>
    req === "supplier_document" ? !has.has("proforma") && !has.has("invoice") : !has.has(req),
  );
}
