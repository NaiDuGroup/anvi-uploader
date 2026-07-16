/**
 * Manual POS / cash settlement of open fiscal invoices from the debtors list.
 */

export type PosSettleMethod = "cash" | "card";

export interface OpenFiscalInvoicePick {
  id: string;
  fullNumber: string;
  totalAmount: string | null;
  issueDate: string | null;
}

/** When exactly one open FF — auto-select it; otherwise require UI multi-select. */
export function autoSelectOpenInvoiceIds(
  invoices: ReadonlyArray<{ id: string }>,
): string[] {
  if (invoices.length === 1) return [invoices[0].id];
  return [];
}

export function buildManualReceiptRef(
  method: PosSettleMethod,
  at: Date = new Date(),
): string {
  const dd = String(at.getDate()).padStart(2, "0");
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  const yyyy = at.getFullYear();
  return `Manual ${method} ${dd}.${mm}.${yyyy}`;
}

/** True when the photo key looks like our receipts/ upload path. */
export function isReceiptPhotoKey(key: string): boolean {
  const t = key.trim();
  if (!t || t.includes("..") || t.startsWith("/") || t.includes("\\")) {
    return false;
  }
  return t.startsWith("receipts/");
}
