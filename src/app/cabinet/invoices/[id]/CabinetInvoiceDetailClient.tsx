"use client";

import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  formatCurrency,
  formatDate,
} from "@/lib/invoice/invoiceDisplay";
import type { SerializedInvoice } from "@/lib/invoice/invoiceSerialization";
import type { SerializedCompanyProfile } from "@/lib/invoice/companyProfile";

export default function CabinetInvoiceDetailClient({
  initialInvoice,
  companyProfile,
}: {
  initialInvoice: SerializedInvoice;
  companyProfile: SerializedCompanyProfile;
}) {
  const { t, locale } = useLanguageStore();
  const invoice = initialInvoice;

  const supplier = invoice.supplierSnapshot ?? {
    name: companyProfile.name,
    fiscalCode: companyProfile.fiscalCode,
    address: companyProfile.address,
    iban: companyProfile.iban,
    bankName: companyProfile.bankName,
    bic: companyProfile.bic,
    directorName: companyProfile.directorName,
    accountantName: companyProfile.accountantName,
    logoPath: companyProfile.logoPath,
  };
  const isPaid = invoice.status === "PAID";
  const isCancelled = invoice.status === "CANCELLED";
  const stateHint = isPaid
    ? t.cabinet.invoices.detailPaidHint
    : isCancelled
      ? t.cabinet.invoices.detailCancelledHint
      : t.cabinet.invoices.detailNotPaidHint;

  return (
    <section>
      <Link
        href="/cabinet/invoices"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.cabinet.invoices.detailBack}
      </Link>

      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            {t.cabinet.invoices.detailTitle(invoice.number ?? "—")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {formatDate(invoice.issueDate, locale)}
          </p>
        </div>
        <a
          href={`/api/cabinet/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          <Button>
            <Download className="h-4 w-4" />
            {t.cabinet.invoices.detailDownloadPdf}
          </Button>
        </a>
      </header>

      <p
        className={`mb-4 rounded-xl border p-3 text-sm ${
          isPaid
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : isCancelled
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {stateHint}
      </p>

      <section className="mb-4 grid gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t.pdfInvoice.supplier}
          </h2>
          <p className="font-medium text-gray-900">{supplier.name}</p>
          <p className="text-sm text-gray-700">
            {t.pdfInvoice.fiscalCode}: {supplier.fiscalCode}
          </p>
          <p className="text-sm text-gray-700">{supplier.address}</p>
          <p className="text-sm text-gray-700">IBAN: {supplier.iban}</p>
          <p className="text-sm text-gray-700">{supplier.bankName}</p>
          <p className="text-sm text-gray-700">BIC: {supplier.bic}</p>
        </div>
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t.cabinet.invoices.colValidUntil}
          </h2>
          {invoice.status === "ISSUED" || invoice.status === "PAID" ? (
            <p className="font-medium text-gray-900">
              {formatDate(invoice.validUntil, locale)}
            </p>
          ) : (
            <p className="text-sm text-gray-500">—</p>
          )}
          {invoice.paidAt ? (
            <p className="mt-2 text-xs text-gray-500">
              {t.invoices.paidAtLabel}: {formatDate(invoice.paidAt, locale)}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2.5">{t.pdfInvoice.article}</th>
              <th className="px-3 py-2.5 w-20 text-right">{t.pdfInvoice.qty}</th>
              <th className="px-3 py-2.5 w-32 text-right">
                {t.pdfInvoice.priceInclVat}
              </th>
              <th className="px-3 py-2.5 w-32 text-right">{t.pdfInvoice.total}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoice.lineItems.map((line) => (
              <tr key={line.id}>
                <td className="px-3 py-2.5 text-gray-900">{line.description}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {line.quantity} {line.unit}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {formatCurrency(line.unitPrice, invoice.currency)}
                </td>
                <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                  {formatCurrency(line.lineTotal, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ml-auto max-w-sm rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <dt>{t.pdfInvoice.includingVat}</dt>
            <dd>{formatCurrency(invoice.vatAmount, invoice.currency)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
            <dt>{t.pdfInvoice.totalDue}</dt>
            <dd>{formatCurrency(invoice.totalAmount, invoice.currency)}</dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
