"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Search,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  X,
  FileDown,
  CreditCard,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MenuSelect,
  type MenuSelectOption,
} from "@/components/ui/MenuSelect";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useFiscalInvoices } from "@/lib/swr";
import { useDebounce } from "@/hooks/useDebounce";
import {
  getReconLabels,
  eFacturaStatusLabel,
  eFacturaStatusBucketLabel,
  EFACTURA_STATUS_FILTER_BUCKETS,
  formatMoney,
  formatShortDate,
} from "@/lib/reconciliation/labels";
import { cn } from "@/lib/utils";
import { isNonDeliveryFiscal } from "@/lib/reconciliation/fiscalFlags";
import { DateRangeFilter } from "./DateRangeFilter";
import FiscalInvoiceDetailDrawer from "./FiscalInvoiceDetailDrawer";

type StatusFilterValue = "" | "signed" | "awaiting_signature";
type PaymentFilterValue = "" | "terminal" | "transfer" | "unpaid";

const PAGE_SIZES = [25, 50, 100] as const;

export default function FiscalInvoicesPageClient() {
  const { t } = useLanguageStore();
  const locale = useLanguageStore((s) => s.locale);
  const L = getReconLabels(locale);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilterValue>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichRemaining, setEnrichRemaining] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importHtml, setImportHtml] = useState("");
  const [importing, setImporting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listTopRef = useRef<HTMLDivElement>(null);
  const skipScrollRef = useRef(true);

  const statusBucket = statusFilter === "" ? null : statusFilter;
  const payment = paymentFilter === "" ? null : paymentFilter;

  const statusFilterOptions = useMemo((): MenuSelectOption<StatusFilterValue>[] => {
    return [
      { value: "", label: L.filterAllStatuses },
      ...EFACTURA_STATUS_FILTER_BUCKETS.map((bucket) => ({
        value: bucket,
        label: eFacturaStatusBucketLabel(bucket, locale),
      })),
    ];
  }, [L.filterAllStatuses, locale]);

  const paymentFilterOptions = useMemo(
    (): MenuSelectOption<PaymentFilterValue>[] => [
      { value: "", label: L.filterAllPayments },
      { value: "terminal", label: L.filterPaymentTerminal },
      { value: "transfer", label: L.filterPaymentTransfer },
      { value: "unpaid", label: L.filterPaymentUnpaid },
    ],
    [
      L.filterAllPayments,
      L.filterPaymentTerminal,
      L.filterPaymentTransfer,
      L.filterPaymentUnpaid,
    ],
  );

  const pageSizeOptions = useMemo(
    (): MenuSelectOption<number>[] =>
      PAGE_SIZES.map((n) => ({ value: n, label: String(n) })),
    [],
  );

  // Reset to the first page whenever any filter changes.
  useEffect(() => {
    setPage(1);
  }, [debounced, statusFilter, paymentFilter, dateFrom, dateTo, pageSize]);

  // After pagination / page-size change, jump back to the list top (100 rows
  // leave the viewport stuck at the footer otherwise).
  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    listTopRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [page, pageSize]);

  const { live, fiscalInvoices, total, totalPages, isLoading, mutate } =
    useFiscalInvoices({
      query: debounced,
      page,
      pageSize,
      statusBucket,
      payment,
      dateFrom,
      dateTo,
    });

  const hasFilters = !!(query || statusFilter || paymentFilter || dateFrom || dateTo);
  const resetFilters = () => {
    setQuery("");
    setStatusFilter("");
    setPaymentFilter("");
    setDateFrom("");
    setDateTo("");
  };

  async function runImport(init: RequestInit) {
    setImporting(true);
    try {
      const res = await fetch(`/api/admin/fiscal-invoices/import`, {
        method: "POST",
        ...init,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? L.actionFail);
      toast.success(L.importOk(data.result.created, data.result.updated));
      setImportHtml("");
      setImportOpen(false);
      void mutate();
      void refreshEnrichProgress();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : L.actionFail);
    } finally {
      setImporting(false);
    }
  }

  async function handleImportPaste() {
    if (!importHtml.trim()) return;
    await runImport({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: importHtml }),
    });
  }

  async function handleImportFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    await runImport({ body: form });
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/fiscal-invoices/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? L.actionFail);
      const r = data.result ?? {};
      const e = data.enrichment ?? {};
      toast.success(
        L.syncOk({
          accepted: r.upserted ?? r.fetched ?? 0,
          searched: r.searchedListed ?? 0,
          archiveListed: r.archivedListed ?? 0,
          archiveCreated: r.archivedCreated ?? 0,
          statusUpdated: r.statusUpdated ?? 0,
          markedDead: r.markedDead ?? 0,
          enrichProcessed: e.enrichProcessed ?? 0,
        }),
      );
      void mutate();
      void refreshEnrichProgress();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : L.actionFail);
    } finally {
      setSyncing(false);
    }
  }

  async function refreshEnrichProgress() {
    try {
      const res = await fetch("/api/admin/fiscal-invoices/enrich-details");
      if (!res.ok) return;
      const data = await res.json();
      setEnrichRemaining(typeof data.remaining === "number" ? data.remaining : null);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshEnrichProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detail enrichment ("B/f" fiscal-receipt detection). Runs chunk-by-chunk
  // until nothing remains; idempotent, so it can be re-triggered any time.
  async function handleEnrich() {
    if (enriching) return;
    setEnriching(true);
    let totalSettled = 0;
    try {
      // Loop bounded chunks; stop when the server reports no remaining work or a
      // chunk makes no forward progress (e.g. SFS throttling all requests).
      for (let i = 0; i < 100; i++) {
        const res = await fetch("/api/admin/fiscal-invoices/enrich-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 50 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? L.actionFail);
        totalSettled += data.settledFound ?? 0;
        setEnrichRemaining(data.remaining ?? 0);
        void mutate();
        if ((data.remaining ?? 0) <= 0) break;
        if ((data.processed ?? 0) === 0) break; // no progress -> avoid infinite loop
      }
      toast.success(L.enrichDone(totalSettled));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : L.actionFail);
    } finally {
      setEnriching(false);
      void refreshEnrichProgress();
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">e-Factura</h2>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              live
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                : "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
            )}
          >
            {live ? L.live : L.mock}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setImportOpen((v) => !v)}>
          <Download className="mr-2 h-4 w-4" />
          {L.importPortal}
        </Button>
        <Button
          variant="outline"
          onClick={handleEnrich}
          disabled={enriching || syncing}
          title={
            enrichRemaining != null ? L.enrichRemaining(enrichRemaining) : undefined
          }
        >
          {enriching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="mr-2 h-4 w-4" />
          )}
          {enriching ? L.enriching : L.enrichDetails}
          {!enriching && enrichRemaining != null && enrichRemaining > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">
              {enrichRemaining}
            </span>
          )}
        </Button>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {syncing ? L.syncing : L.sync}
        </Button>
        </div>
      </div>

      {importOpen && (
        <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-sm text-gray-600">{L.importPortalHint}</p>
          <div className="mb-3 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,.html,text/html"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >
              <Upload className="mr-2 h-4 w-4" />
              {L.importFile}
            </Button>
            <span className="text-xs text-gray-500">{L.importOr}</span>
          </div>
          <textarea
            value={importHtml}
            onChange={(e) => setImportHtml(e.target.value)}
            rows={6}
            placeholder="<table class='fm-dg-rows' …> … </table>"
            className="w-full rounded border border-gray-300 p-2 font-mono text-xs"
          />
          <div className="mt-2 flex justify-end">
            <Button
              onClick={handleImportPaste}
              disabled={importing || !importHtml.trim()}
            >
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {importing ? L.importing : L.importAction}
            </Button>
          </div>
        </div>
      )}

      <div
        ref={listTopRef}
        className="mb-4 flex min-w-0 items-center gap-2 scroll-mt-24"
      >
        <div className="relative min-w-0 max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L.search}
            className="h-9 rounded-lg border-gray-300 pl-8 text-xs font-medium shadow-none placeholder:text-gray-500"
          />
        </div>

        <MenuSelect<StatusFilterValue>
          id="fiscal-status-filter"
          ariaLabel={L.filterAllStatuses}
          value={statusFilter}
          options={statusFilterOptions}
          onChange={setStatusFilter}
          leadingIcon={<Filter className="h-3.5 w-3.5 shrink-0" />}
          className="w-[160px] shrink-0"
          buttonClassName={cn(
            "h-9 rounded-lg border px-2.5 text-xs font-medium shadow-none",
            statusFilter
              ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100/70"
              : "border-gray-300 bg-white text-gray-600",
          )}
        />

        <MenuSelect<PaymentFilterValue>
          id="fiscal-payment-filter"
          ariaLabel={L.filterAllPayments}
          value={paymentFilter}
          options={paymentFilterOptions}
          onChange={setPaymentFilter}
          leadingIcon={<CreditCard className="h-3.5 w-3.5 shrink-0" />}
          className="w-[180px] shrink-0"
          buttonClassName={cn(
            "h-9 rounded-lg border px-2.5 text-xs font-medium shadow-none",
            paymentFilter
              ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100/70"
              : "border-gray-300 bg-white text-gray-600",
          )}
        />

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
          locale={locale}
          t={t}
          className="shrink-0"
        />

        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
            {L.filterReset}
          </button>
        )}
      </div>

      {isLoading && !fiscalInvoices ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !fiscalInvoices || fiscalInvoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Search className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-base font-medium">{L.fiscalEmpty}</p>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm transition-opacity",
              isLoading && "opacity-60",
            )}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">{L.colNumber}</th>
                  <th className="px-4 py-3">{L.colDate}</th>
                  <th className="px-4 py-3 hidden md:table-cell">{L.colStatus}</th>
                  <th className="px-4 py-3">{L.colBuyer}</th>
                  <th className="px-4 py-3 text-right">{L.colAmount}</th>
                  <th className="px-4 py-3">{L.colPayment}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fiscalInvoices.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setOpenId(f.id)}
                    className="cursor-pointer transition-colors hover:bg-gray-50/60"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {f.fullNumber}
                        {isNonDeliveryFiscal(f.redirections) ? (
                          <span
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                            title={L.nonLivrareHint}
                          >
                            {L.nonLivrare}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {formatShortDate(f.issueDate)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-600">
                      {eFacturaStatusLabel(f.status, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{f.buyerName ?? "—"}</div>
                      {f.buyerIdno && (
                        <div className="text-xs text-gray-400">{f.buyerIdno}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-gray-900">
                      {formatMoney(f.totalAmount, f.currency, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                          f.receiptSettledAt
                            ? "bg-blue-100 text-blue-700"
                            : f.paidAt
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600",
                        )}
                        title={f.receiptRef ?? undefined}
                      >
                        {f.receiptSettledAt ? (
                          <>
                            <CreditCard className="h-3 w-3" />
                            {L.paidByReceipt}
                          </>
                        ) : f.paidAt ? (
                          L.paid
                        ) : (
                          L.unpaid
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <span>{L.perPage}</span>
              <MenuSelect<number>
                value={pageSize}
                options={pageSizeOptions}
                onChange={(n) =>
                  setPageSize(n as (typeof PAGE_SIZES)[number])
                }
                ariaLabel={L.perPage}
                popoverMinWidthPx={88}
                className="w-20"
                buttonClassName="h-9 rounded-lg border-gray-300 px-2.5 text-xs font-medium shadow-none"
              />
              <span className="text-gray-400">· {L.fiscalCount(total)}</span>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-gray-600">
                  {L.pageOf(page, totalPages)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {openId && (
        <FiscalInvoiceDetailDrawer
          id={openId}
          live={live}
          locale={locale}
          L={L}
          onClose={() => setOpenId(null)}
          onEnriched={() => void mutate()}
        />
      )}
    </div>
  );
}
