"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  formatCurrency,
  formatDate,
} from "@/lib/invoice/invoiceDisplay";
import type { SerializedInvoice } from "@/lib/invoice/invoiceSerialization";

function statusLabel(
  status: string,
  isExpired: boolean,
  t: ReturnType<typeof useLanguageStore.getState>["t"],
): string {
  if (status === "ISSUED" && isExpired) return t.cabinet.invoices.statusExpired;
  if (status === "ISSUED") return t.cabinet.invoices.statusIssued;
  if (status === "PAID") return t.cabinet.invoices.statusPaid;
  if (status === "CANCELLED") return t.cabinet.invoices.statusCancelled;
  return status;
}

function statusClass(status: string, isExpired: boolean): string {
  if (status === "ISSUED" && isExpired)
    return "bg-orange-50 text-orange-800 ring-orange-200";
  if (status === "ISSUED") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status === "PAID") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (status === "CANCELLED") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-gray-100 text-gray-700 ring-gray-200";
}

export default function CabinetInvoicesListClient() {
  const { t, locale } = useLanguageStore();
  const [invoices, setInvoices] = useState<SerializedInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/cabinet/invoices", { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { invoices: SerializedInvoice[] };
        setInvoices(data.invoices);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setInvoices([]);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <section>
      <header className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          {t.cabinet.invoices.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t.cabinet.invoices.pageSubtitle}
        </p>
      </header>

      {invoices === null ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          ...
        </p>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-white p-6 text-center text-sm text-red-700">
          {error}
        </p>
      ) : invoices.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          {t.cabinet.invoices.empty}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/cabinet/invoices/${inv.id}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-amber-50/30"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-gray-900">
                    {t.cabinet.invoices.colNumber} {inv.number ?? "—"}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusClass(inv.status, inv.isExpired)}`}
                  >
                    {statusLabel(inv.status, inv.isExpired, t)}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {t.cabinet.invoices.colDate}: {formatDate(inv.issueDate, locale)}
                </p>
                {(inv.status === "ISSUED" || inv.status === "PAID") && (
                  <p className="text-xs text-gray-500">
                    {t.cabinet.invoices.colValidUntil}:{" "}
                    {formatDate(inv.validUntil, locale)}
                  </p>
                )}
                <p className="mt-auto pt-1 text-lg font-bold text-gray-900">
                  {formatCurrency(inv.totalAmount, inv.currency)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
