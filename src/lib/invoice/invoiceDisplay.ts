import type { TranslationDictionary } from "@/lib/i18n/types";
import type { InvoiceStatus } from "@/lib/validations";
import type { SerializedInvoice } from "./invoiceSerialization";

export type InvoiceDisplayStatus = InvoiceStatus | "EXPIRED";

export function effectiveInvoiceStatus(
  inv: Pick<SerializedInvoice, "status" | "isExpired">,
): InvoiceDisplayStatus {
  if (inv.status === "ISSUED" && inv.isExpired) return "EXPIRED";
  return inv.status;
}

export function invoiceStatusLabel(
  status: InvoiceDisplayStatus,
  t: TranslationDictionary,
): string {
  switch (status) {
    case "DRAFT":
      return t.invoices.statusDraft;
    case "ISSUED":
      return t.invoices.statusIssued;
    case "PAID":
      return t.invoices.statusPaid;
    case "CANCELLED":
      return t.invoices.statusCancelled;
    case "EXPIRED":
      return t.invoices.statusExpired;
  }
}

export function invoiceStatusClasses(status: InvoiceDisplayStatus): string {
  switch (status) {
    case "DRAFT":
      return "bg-gray-100 text-gray-700 ring-gray-200";
    case "ISSUED":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "PAID":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "CANCELLED":
      return "bg-red-50 text-red-700 ring-red-200";
    case "EXPIRED":
      return "bg-orange-50 text-orange-800 ring-orange-200";
  }
}

export function formatCurrency(
  amount: string | number,
  currency: string,
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(num)) return `${amount} ${currency}`;
  return `${num.toLocaleString("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function formatDate(iso: string, locale = "ro"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "ru" ? "ru-RU" : "ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
