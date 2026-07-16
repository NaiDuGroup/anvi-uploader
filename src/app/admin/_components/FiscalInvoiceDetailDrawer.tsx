"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, X, Download, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFiscalInvoiceDetail } from "@/lib/swr";
import type { ReconLabels } from "@/lib/reconciliation/labels";
import { eFacturaStatusLabel, formatMoney, formatShortDate } from "@/lib/reconciliation/labels";
import type { Locale } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import { isNonDeliveryFiscal } from "@/lib/reconciliation/fiscalFlags";

function net(total: string | null, vat: string | null): string | null {
  if (total == null) return null;
  const t = Number(total);
  const v = vat != null ? Number(vat) : 0;
  if (!Number.isFinite(t)) return null;
  return (t - v).toFixed(2);
}

export default function FiscalInvoiceDetailDrawer({
  id,
  live,
  locale,
  L,
  onClose,
  onEnriched,
  overlayClassName,
}: {
  id: string;
  live: boolean;
  locale: Locale;
  L: ReconLabels;
  onClose: () => void;
  onEnriched: () => void;
  /** Override stacking when nested above another modal (default z-50). */
  overlayClassName?: string;
}) {
  const { detail, isLoading, mutate } = useFiscalInvoiceDetail(id);
  const [fetching, setFetching] = useState(false);

  async function loadDetails() {
    setFetching(true);
    try {
      const res = await fetch(`/api/admin/fiscal-invoices/${id}/fetch`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed");
      toast.success(L.detailsLoaded);
      await mutate();
      onEnriched();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setFetching(false);
    }
  }

  const inv = detail?.invoice;
  const cur = inv?.currency ?? "MDL";

  return (
    <div
      className={cn(
        "fixed inset-0 flex justify-end",
        overlayClassName ?? "z-50",
      )}
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">
                {inv?.fullNumber ?? "…"}
              </h2>
              {inv && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {eFacturaStatusLabel(inv.status, locale)}
                </span>
              )}
              {inv?.receiptSettledAt ? (
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {L.paidByReceipt}
                </span>
              ) : inv?.paidAt ? (
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  {L.paid}
                </span>
              ) : null}
              {isNonDeliveryFiscal(inv?.redirections) && (
                <span
                  className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                  title={L.nonLivrareHint}
                >
                  {L.nonLivrare}
                </span>
              )}
            </div>
            {inv?.issueDate && (
              <p className="mt-0.5 text-sm text-gray-500">
                {formatShortDate(inv.issueDate)}
              </p>
            )}
            {isNonDeliveryFiscal(inv?.redirections) ? (
              <p className="mt-1 text-xs text-amber-700">{L.nonLivrareHint}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title={L.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading || !inv ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-5">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {L.detailInfo}
              </h3>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <Field label={L.fieldBuyer}>
                  <div className="text-gray-900">{inv.buyerName ?? "—"}</div>
                  {inv.buyerIdno && (
                    <div className="text-xs text-gray-400">{inv.buyerIdno}</div>
                  )}
                </Field>
                <Field label={L.fieldPaymentStatus}>
                  <span
                    className={cn(
                      "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                      inv.receiptSettledAt
                        ? "bg-blue-100 text-blue-700"
                        : inv.paidAt
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600",
                    )}
                  >
                    {inv.receiptSettledAt
                      ? L.paidByReceipt
                      : inv.paidAt
                        ? L.paid
                        : L.unpaid}
                  </span>
                </Field>
                {inv.receiptPhotoKey ? (
                  <Field label={L.receiptPhoto}>
                    <a
                      href={`/api/admin/file-by-key?key=${encodeURIComponent(inv.receiptPhotoKey)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                    >
                      <ImageIcon className="h-4 w-4" />
                      {L.receiptPhoto}
                    </a>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/admin/file-by-key?key=${encodeURIComponent(inv.receiptPhotoKey)}`}
                      alt={L.receiptPhoto}
                      className="mt-2 max-h-48 max-w-full rounded-lg border border-gray-200 object-contain"
                    />
                  </Field>
                ) : null}
                <Field label={L.fieldNet}>
                  {formatMoney(net(inv.totalAmount, inv.vatAmount ?? null), cur, locale)}
                </Field>
                <Field label={L.fieldVat}>
                  {formatMoney(inv.vatAmount ?? null, cur, locale)}
                </Field>
                <Field label={L.fieldTotal}>
                  <span className="font-semibold text-gray-900">
                    {formatMoney(inv.totalAmount, cur, locale)}
                  </span>
                </Field>
              </dl>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {L.detailLines}
                </h3>
                {live && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadDetails}
                    disabled={fetching}
                  >
                    {fetching ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-3.5 w-3.5" />
                    )}
                    {fetching ? L.loadingDetails : L.loadDetails}
                  </Button>
                )}
              </div>
              {detail && detail.lines.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        <th className="px-3 py-2">{L.colName}</th>
                        <th className="px-3 py-2 text-right">{L.colQty}</th>
                        <th className="px-3 py-2">{L.colUnit}</th>
                        <th className="px-3 py-2 text-right">{L.colUnitPrice}</th>
                        <th className="px-3 py-2 text-right">{L.colLineTotal}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail.lines.map((line, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-gray-900">
                            {line.name ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {line.quantity ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {line.unit ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-gray-600">
                            {formatMoney(line.unitPrice, cur, locale)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-gray-900">
                            {formatMoney(line.total, cur, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                  {L.linesUnavailable}
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {L.detailPayments}
              </h3>
              {detail && detail.allocations.length > 0 ? (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {detail.allocations.map((a) => (
                    <li key={a.id} className="px-4 py-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">
                          {formatMoney(a.amount, cur, locale)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {a.transaction
                            ? formatShortDate(a.transaction.bookingDate)
                            : ""}
                        </span>
                      </div>
                      {a.transaction?.counterpartyName && (
                        <div className="mt-0.5 text-gray-600">
                          {a.transaction.counterpartyName}
                        </div>
                      )}
                      {a.transaction?.purpose && (
                        <div className="mt-0.5 truncate text-xs text-gray-400">
                          {a.transaction.purpose}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">{L.noPayments}</p>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-gray-700">{children}</dd>
    </div>
  );
}
