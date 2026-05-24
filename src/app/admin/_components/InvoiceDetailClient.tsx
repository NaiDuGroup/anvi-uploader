"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  effectiveInvoiceStatus,
  formatCurrency,
  formatDate,
  invoiceStatusClasses,
  invoiceStatusLabel,
} from "@/lib/invoice/invoiceDisplay";
import type { SerializedInvoice } from "@/lib/invoice/invoiceSerialization";
import type { SerializedCompanyProfile } from "@/lib/invoice/companyProfile";
import { isSuperAdmin } from "@/lib/roles";
import { PageSkeleton } from "./PageSkeleton";

/**
 * Shell component for `/admin/invoices/[id]`. Fetches the invoice payload
 * and company profile in parallel on mount (replacing the previous SSR
 * props), shows a {@link PageSkeleton} while either request is in flight,
 * and renders {@link InvoiceDetailView} once both have resolved.
 */
export default function InvoiceDetailClient({
  invoiceId,
  currentUserRole,
}: {
  invoiceId: string;
  currentUserRole: string;
}) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<SerializedInvoice | null>(null);
  const [companyProfile, setCompanyProfile] =
    useState<SerializedCompanyProfile | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/admin/invoices/${invoiceId}`).then(async (res) => {
        if (res.status === 404) {
          throw new Error("__NOT_FOUND__");
        }
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || res.statusText);
        }
        return res.json() as Promise<{ invoice: SerializedInvoice }>;
      }),
      fetch("/api/admin/company-profile").then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || res.statusText);
        }
        return res.json() as Promise<{ profile: SerializedCompanyProfile }>;
      }),
    ])
      .then(([inv, prof]) => {
        if (cancelled) return;
        setInvoice(inv.invoice);
        setCompanyProfile(prof.profile);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof Error && err.message === "__NOT_FOUND__") {
          router.replace("/admin/invoices");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId, router]);

  if (error) {
    return (
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5">
        <p
          role="alert"
          className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
        >
          {error}
        </p>
      </main>
    );
  }

  if (!invoice || !companyProfile) return <PageSkeleton variant="detail" />;

  return (
    <InvoiceDetailView
      initialInvoice={invoice}
      companyProfile={companyProfile}
      currentUserRole={currentUserRole}
    />
  );
}

function InvoiceDetailView({
  initialInvoice,
  companyProfile,
  currentUserRole,
}: {
  initialInvoice: SerializedInvoice;
  companyProfile: SerializedCompanyProfile;
  currentUserRole: string;
}) {
  const router = useRouter();
  const { t, locale } = useLanguageStore();
  const [invoice, setInvoice] = useState<SerializedInvoice>(initialInvoice);
  const [busy, setBusy] = useState<"" | "issue" | "paid" | "cancel" | "delete">(
    "",
  );
  const [error, setError] = useState<string | null>(null);
  const [paidNote, setPaidNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [paidModalOpen, setPaidModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const status = effectiveInvoiceStatus(invoice);
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
  const payer = invoice.clientSnapshot ?? {
    kind: invoice.client.kind,
    personName: invoice.client.personName,
    companyName: invoice.client.companyName,
    companyIdno: invoice.client.companyIdno,
    companyIban: invoice.client.companyIban,
    phone: invoice.client.phone,
    email: null,
  };

  async function callAction(
    path: string,
    label: typeof busy,
    init?: RequestInit,
  ): Promise<SerializedInvoice | null> {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? "Action failed");
      }
      const data = (await res.json()) as { invoice: SerializedInvoice };
      setInvoice(data.invoice);
      return data.invoice;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function handleIssue() {
    const updated = await callAction(
      `/api/admin/invoices/${invoice.id}/issue`,
      "issue",
    );
    if (updated) {
      window.open(`/api/admin/invoices/${invoice.id}/pdf`, "_blank");
    }
  }

  async function handleMarkPaid() {
    const ok = await callAction(
      `/api/admin/invoices/${invoice.id}/mark-paid`,
      "paid",
      {
        body: JSON.stringify({ paidNote: paidNote.trim() || null }),
      },
    );
    if (ok) setPaidModalOpen(false);
  }

  async function handleCancel() {
    const ok = await callAction(
      `/api/admin/invoices/${invoice.id}/cancel`,
      "cancel",
      {
        body: JSON.stringify({ reason: cancelReason.trim() || null }),
      },
    );
    if (ok) setCancelModalOpen(false);
  }

  async function handleDelete() {
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? "Delete failed");
      }
      router.push("/admin/invoices");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy("");
    }
  }

  const canDelete =
    invoice.status === "DRAFT" || isSuperAdmin(currentUserRole);

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5">
      <button
        type="button"
        onClick={() => router.push("/admin/invoices")}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.invoices.backToList}
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {invoice.number
              ? `${t.pdfInvoice.invoiceNo} ${invoice.number}`
              : t.invoices.statusDraft}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${invoiceStatusClasses(status)}`}
            >
              {invoiceStatusLabel(status, t)}
            </span>
            <span className="text-sm text-gray-500">
              · {formatDate(invoice.issueDate, locale)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {invoice.status === "DRAFT" && (
            <Button onClick={handleIssue} disabled={busy !== ""}>
              {busy === "issue" ? t.invoices.issuing : t.invoices.detailIssue}
            </Button>
          )}
          {invoice.status === "ISSUED" && (
            <Button onClick={() => setPaidModalOpen(true)}>
              <CheckCircle2 className="h-4 w-4" />
              {t.invoices.detailMarkPaid}
            </Button>
          )}
          {(invoice.status === "DRAFT" || invoice.status === "ISSUED") && (
            <Button
              variant="outline"
              onClick={() => setCancelModalOpen(true)}
              disabled={busy !== ""}
            >
              <XCircle className="h-4 w-4" />
              {t.invoices.detailCancel}
            </Button>
          )}
          {(invoice.status === "ISSUED" ||
            invoice.status === "PAID" ||
            invoice.status === "CANCELLED") && (
            <a
              href={`/api/admin/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline">
                <Download className="h-4 w-4" />
                {t.invoices.detailDownloadPdf}
              </Button>
            </a>
          )}
          {invoice.status === "DRAFT" && (
            <Link href={`/admin/invoices/${invoice.id}/edit`}>
              <Button variant="outline">
                <FileText className="h-4 w-4" />
                {t.invoices.detailEdit}
              </Button>
            </Link>
          )}
          {canDelete && (
            <Button
              variant="outline"
              onClick={() => setDeleteModalOpen(true)}
              className="text-red-600"
            >
              <Trash2 className="h-4 w-4" />
              {t.invoices.detailDelete}
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="grid gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2">
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
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
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t.pdfInvoice.payer}
              </h2>
              <p className="font-medium text-gray-900">
                {payer.companyName ?? payer.personName ?? invoice.client.displayName}
              </p>
              {payer.companyIdno ? (
                <p className="text-sm text-gray-700">
                  {t.pdfInvoice.fiscalCode}: {payer.companyIdno}
                </p>
              ) : null}
              {payer.companyIban ? (
                <p className="text-sm text-gray-700">IBAN: {payer.companyIban}</p>
              ) : null}
              {payer.phone ? (
                <p className="text-sm text-gray-700">{payer.phone}</p>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2.5">{t.invoices.itemsHeaderArticle}</th>
                  <th className="px-3 py-2.5 w-16 text-right">
                    {t.invoices.itemsHeaderQty}
                  </th>
                  <th className="px-3 py-2.5 w-32 text-right">
                    {t.invoices.itemsHeaderPrice}
                  </th>
                  <th className="px-3 py-2.5 w-32 text-right">
                    {t.invoices.itemsHeaderTotal}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoice.lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                      {t.invoices.detailNoLines}
                    </td>
                  </tr>
                ) : (
                  invoice.lineItems.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2.5 text-gray-900">
                        <div>{line.description}</div>
                        {line.orderNumber != null ? (
                          <Link
                            href={`/admin/orders?search=${line.orderNumber}`}
                            className="mt-0.5 inline-block text-xs text-amber-700 hover:underline"
                          >
                            {t.invoices.detailLinkedOrder(line.orderNumber)}
                          </Link>
                        ) : null}
                      </td>
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
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t.invoices.totalsSection}
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt>{t.invoices.totalSubtotal}</dt>
                <dd>{formatCurrency(invoice.subtotal, invoice.currency)}</dd>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <dt>{t.invoices.totalVat}</dt>
                <dd>{formatCurrency(invoice.vatAmount, invoice.currency)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
                <dt>{t.invoices.totalDue}</dt>
                <dd>{formatCurrency(invoice.totalAmount, invoice.currency)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t.invoices.detailHistory}
            </h2>
            <ul className="space-y-2 text-xs text-gray-700">
              <li>
                <span className="text-gray-400">·</span>{" "}
                {t.invoices.detailHistoryCreated} —{" "}
                {formatDate(invoice.createdAt, locale)}
                {invoice.createdBy ? (
                  <>
                    {" "}
                    <span className="text-gray-400">·</span>{" "}
                    <span className="text-gray-600">
                      {t.invoices.detailHistoryCreatedBy(invoice.createdBy.name)}
                    </span>
                  </>
                ) : null}
              </li>
              {invoice.number && invoice.status !== "DRAFT" ? (
                <li>
                  <span className="text-amber-600">·</span>{" "}
                  {t.invoices.detailHistoryIssued} —{" "}
                  {formatDate(invoice.issueDate, locale)}
                </li>
              ) : null}
              {invoice.paidAt ? (
                <li>
                  <span className="text-emerald-600">·</span>{" "}
                  {t.invoices.detailHistoryPaid} —{" "}
                  {formatDate(invoice.paidAt, locale)}
                  {invoice.paidNote ? ` — ${invoice.paidNote}` : ""}
                </li>
              ) : null}
              {invoice.cancelledAt ? (
                <li>
                  <span className="text-red-600">·</span>{" "}
                  {t.invoices.detailHistoryCancelled} —{" "}
                  {formatDate(invoice.cancelledAt, locale)}
                  {invoice.cancelReason ? ` — ${invoice.cancelReason}` : ""}
                </li>
              ) : null}
              {invoice.status === "ISSUED" || invoice.status === "PAID" ? (
                <li>
                  <span className="text-gray-400">·</span>{" "}
                  {t.invoices.detailValidUntil}{" "}
                  {formatDate(invoice.validUntil, locale)}
                </li>
              ) : null}
            </ul>
          </div>
        </aside>
      </div>

      {paidModalOpen ? (
        <ConfirmModal
          title={t.invoices.markPaidTitle}
          confirmLabel={t.invoices.markPaidConfirm}
          confirmDisabled={busy === "paid"}
          onConfirm={handleMarkPaid}
          onCancel={() => setPaidModalOpen(false)}
        >
          <label className="block text-sm font-medium text-gray-700">
            {t.invoices.markPaidNoteLabel}
          </label>
          <textarea
            value={paidNote}
            onChange={(e) => setPaidNote(e.target.value)}
            rows={3}
            placeholder={t.invoices.markPaidNotePlaceholder}
            className="mt-1 flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950"
          />
        </ConfirmModal>
      ) : null}

      {cancelModalOpen ? (
        <ConfirmModal
          title={t.invoices.cancelTitle}
          confirmLabel={t.invoices.cancelConfirm}
          confirmVariant="destructive"
          confirmDisabled={busy === "cancel"}
          onConfirm={handleCancel}
          onCancel={() => setCancelModalOpen(false)}
        >
          <label className="block text-sm font-medium text-gray-700">
            {t.invoices.cancelReasonLabel}
          </label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            placeholder={t.invoices.cancelReasonPlaceholder}
            className="mt-1 flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950"
          />
        </ConfirmModal>
      ) : null}

      {deleteModalOpen ? (
        <ConfirmModal
          title={t.invoices.deleteTitle}
          confirmLabel={t.invoices.deleteConfirm}
          confirmVariant="destructive"
          confirmDisabled={busy === "delete"}
          onConfirm={handleDelete}
          onCancel={() => setDeleteModalOpen(false)}
        >
          <p className="text-sm text-gray-700">{t.invoices.deleteBody}</p>
        </ConfirmModal>
      ) : null}
    </main>
  );
}

function ConfirmModal({
  title,
  confirmLabel,
  confirmVariant = "default",
  confirmDisabled,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        </header>
        <div className="px-5 py-4">{children}</div>
        <footer className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
