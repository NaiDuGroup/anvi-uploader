"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Wallet,
} from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { NavLinkButton } from "@/components/ui/NavLinkButton";
import { clientPickerLabel } from "@/lib/studioClient";
import { formatAmountMdl } from "@/lib/money";
import { cn } from "@/lib/utils";
import { fetcher } from "@/lib/swr/fetcher";
import { ClientInvoicesSection } from "./ClientsPageClient";

interface ClientInfo {
  id: string;
  kind: string;
  phone: string | null;
  personName: string | null;
  companyName: string | null;
  companyIdno: string | null;
  email: string | null;
  isDealer: boolean;
  createdAt: string;
  userAccount: { id: string; name: string } | null;
}

interface ClientOrderRow {
  id: string;
  orderNumber: number;
  productType: string;
  status: string;
  price: number | null;
  isPaid: boolean;
  paidAt: string | null;
  createdAt: string;
  notes: string | null;
}

interface ClientOrdersResponse {
  orders: ClientOrderRow[];
  summary: {
    ordersCount: number;
    unpaidCount: number;
    unpaidTotalMdl: number;
    paidTotalMdl: number;
  };
}

export default function ClientCardPageClient({ clientId }: { clientId: string }) {
  const { t } = useLanguageStore();

  const {
    data: client,
    error: clientError,
    isLoading: clientLoading,
  } = useSWR<ClientInfo>(`/api/admin/clients/${clientId}`, fetcher, {
    revalidateOnFocus: false,
  });
  const {
    data: ordersData,
    error: ordersError,
    isLoading: ordersLoading,
    mutate: mutateOrders,
  } = useSWR<ClientOrdersResponse>(
    `/api/admin/clients/${clientId}/orders`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const productLabel = useCallback(
    (productType: string): string => {
      switch (productType) {
        case "mug":
          return t.cabinet.orderProductMug;
        case "notebook":
          return t.cabinet.orderProductNotebook;
        case "large_format_print":
          return t.cabinet.orderProductLargeFormat;
        default:
          return t.cabinet.orderProductPaper;
      }
    },
    [t],
  );

  const statusLabel = (status: string): string =>
    (t.statuses as Record<string, string>)[status] ?? status;

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const toggleOrderPaid = useCallback(
    async (order: ClientOrderRow) => {
      setPendingOrderId(order.id);
      setBulkError(null);
      try {
        const res = await fetch(`/api/orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ isPaid: !order.isPaid }),
        });
        if (!res.ok) throw new Error(t.admin.clientCardMarkPaidFailed);
        await mutateOrders();
      } catch (err) {
        setBulkError(
          err instanceof Error ? err.message : t.admin.clientCardMarkPaidFailed,
        );
      } finally {
        setPendingOrderId(null);
      }
    },
    [mutateOrders, t],
  );

  const markAllPaid = useCallback(async () => {
    setBulkBusy(true);
    setBulkError(null);
    setBulkMessage(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(t.admin.clientCardMarkPaidFailed);
      const data = (await res.json()) as { paidCount: number };
      setBulkMessage(t.admin.clientCardMarkPaidDone(data.paidCount));
      setConfirmAllOpen(false);
      await mutateOrders();
    } catch (err) {
      setBulkError(
        err instanceof Error ? err.message : t.admin.clientCardMarkPaidFailed,
      );
    } finally {
      setBulkBusy(false);
    }
  }, [clientId, mutateOrders, t]);

  if (clientLoading) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </main>
    );
  }

  if (clientError || !client) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-6">
        <BackLink label={t.admin.clientCardBack} />
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {t.admin.clientCardLoadFailed}
        </div>
      </main>
    );
  }

  const summary = ordersData?.summary;
  const orders = ordersData?.orders ?? [];
  const hasDebt = (summary?.unpaidCount ?? 0) > 0;

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6">
      <BackLink label={t.admin.clientCardBack} />

      {/* Header */}
      <div className="mt-3 mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              {clientPickerLabel(client)}
            </h1>
            <span
              className={cn(
                "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                client.kind === "LEGAL"
                  ? "bg-violet-100 text-violet-800"
                  : "bg-amber-100 text-amber-900",
              )}
            >
              {client.kind === "LEGAL"
                ? t.admin.clientsKindLegal
                : t.admin.clientsKindIndividual}
            </span>
            {client.isDealer ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/80">
                {t.admin.clientsDealerYes}
              </span>
            ) : null}
            {client.userAccount ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5" />
                {t.admin.clientsPortalCreated}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {client.phone ?? "—"}
            {client.email ? ` · ${client.email}` : ""}
            {client.companyIdno ? ` · IDNO ${client.companyIdno}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <NavLinkButton
            href={`/admin/invoices/new?clientId=${client.id}`}
            prefetch={false}
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            leadingIcon={<FileText className="h-3.5 w-3.5" />}
          >
            {t.invoices.clientHistoryNew}
          </NavLinkButton>
          <NavLinkButton
            href={`/admin/orders/new?clientId=${client.id}`}
            prefetch={false}
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            leadingIcon={<Pencil className="h-3.5 w-3.5" />}
          >
            {t.cabinet.newOrderButton}
          </NavLinkButton>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label={t.admin.clientCardSummaryDebt}
          value={formatAmountMdl(summary?.unpaidTotalMdl ?? 0, t.admin.currency)}
          tone={hasDebt ? "red" : "green"}
        />
        <SummaryCard
          label={t.admin.clientCardSummaryUnpaidOrders}
          value={String(summary?.unpaidCount ?? 0)}
          tone={hasDebt ? "red" : "neutral"}
        />
        <SummaryCard
          label={t.admin.clientCardSummaryOrders}
          value={String(summary?.ordersCount ?? 0)}
          tone="neutral"
        />
        <SummaryCard
          label={t.admin.clientCardSummaryPaidTotal}
          value={formatAmountMdl(summary?.paidTotalMdl ?? 0, t.admin.currency)}
          tone="neutral"
        />
      </div>

      {bulkError ? (
        <p className="mb-3 text-sm text-red-600" role="alert">
          {bulkError}
        </p>
      ) : null}
      {bulkMessage ? (
        <p className="mb-3 text-sm font-medium text-emerald-700" role="status">
          {bulkMessage}
        </p>
      ) : null}

      {/* Orders history */}
      <section className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {t.admin.clientCardOrdersTitle}
          </h2>
          {hasDebt ? (
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              disabled={bulkBusy}
              onClick={() => setConfirmAllOpen(true)}
            >
              <Wallet className="h-3.5 w-3.5" />
              {t.admin.clientCardMarkAllPaid}
            </Button>
          ) : null}
        </header>

        {ordersLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : ordersError ? (
          <p className="px-4 py-8 text-center text-sm text-red-600">
            {t.admin.clientCardLoadFailed}
          </p>
        ) : orders.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">
            {t.admin.clientCardNoOrders}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5">{t.admin.clientCardColOrder}</th>
                  <th className="px-4 py-2.5">{t.admin.clientCardColDate}</th>
                  <th className="px-4 py-2.5">{t.admin.clientCardColProduct}</th>
                  <th className="px-4 py-2.5">{t.admin.clientCardColStatus}</th>
                  <th className="px-4 py-2.5 text-right">{t.admin.clientCardColAmount}</th>
                  <th className="px-4 py-2.5">{t.admin.clientCardColPayment}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className={cn(
                      "hover:bg-gray-50/60",
                      !o.isPaid && "bg-red-50/40",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/orders/${o.id}/edit`}
                        prefetch={false}
                        className="font-medium text-gray-900 hover:text-amber-700 hover:underline"
                      >
                        #{String(o.orderNumber).padStart(4, "0")}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {formatDate(o.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {productLabel(o.productType)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                        {statusLabel(o.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                      {o.price !== null
                        ? formatAmountMdl(o.price, t.admin.currency)
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        disabled={pendingOrderId === o.id}
                        onClick={() => toggleOrderPaid(o)}
                        title={o.isPaid ? t.admin.markUnpaid : t.admin.markPaid}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                          o.isPaid
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80 hover:bg-emerald-100"
                            : "bg-red-50 text-red-700 ring-red-200/80 hover:bg-red-100",
                          pendingOrderId === o.id && "opacity-50",
                        )}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {o.isPaid ? t.admin.paid : t.admin.unpaid}
                      </button>
                      {o.isPaid && o.paidAt ? (
                        <span className="ml-2 text-[11px] text-gray-400">
                          {t.admin.clientCardPaidAt(formatDate(o.paidAt))}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invoices (Cont spre plată) — separate document track */}
      <ClientInvoicesSection clientId={client.id} t={t} />

      {confirmAllOpen && summary ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => (bulkBusy ? null : setConfirmAllOpen(false))}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold">
              {t.admin.clientCardMarkAllPaidConfirmTitle}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {t.admin.clientCardMarkAllPaidConfirmBody(
                summary.unpaidCount,
                formatAmountMdl(summary.unpaidTotalMdl, t.admin.currency),
              )}
            </p>
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={bulkBusy}
                onClick={() => setConfirmAllOpen(false)}
              >
                {t.admin.cancel}
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={bulkBusy}
                onClick={markAllPaid}
              >
                {bulkBusy
                  ? t.admin.clientCardMarkPaidBusy
                  : t.admin.clientCardMarkAllPaid}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/admin/clients"
      prefetch={false}
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "red" | "green" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 shadow-sm",
        tone === "red" && "border-red-200 bg-red-50",
        tone === "green" && "border-emerald-200 bg-emerald-50",
        tone === "neutral" && "border-gray-200 bg-white",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-bold",
          tone === "red" && "text-red-700",
          tone === "green" && "text-emerald-700",
          tone === "neutral" && "text-gray-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}
