"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { PurchaseInvoiceListResponse, PurchaseSyncResult } from "@/lib/purchasing/dto";
import { PurchaseInvoiceStatus, PurchaseLineStatus } from "@/lib/purchasing/types";
import {
  formatDate,
  formatDateTime,
  formatMdl,
  PURCHASE_API,
  STALE_SYNC_MS,
} from "@/app/admin/_components/purchasing/purchaseUi";

enum ListFilter {
  Open = "open",
  All = "all",
}

const STATUS_TONE: Record<PurchaseInvoiceStatus, string> = {
  [PurchaseInvoiceStatus.New]: "bg-sky-50 text-sky-800 ring-sky-200",
  [PurchaseInvoiceStatus.NeedsReview]: "bg-amber-50 text-amber-800 ring-amber-200",
  [PurchaseInvoiceStatus.PartiallyPosted]: "bg-violet-50 text-violet-800 ring-violet-200",
  [PurchaseInvoiceStatus.Posted]: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  [PurchaseInvoiceStatus.Ignored]: "bg-gray-100 text-gray-600 ring-gray-200",
};

export default function IncomingInvoicesPageClient() {
  const { t, locale } = useLanguageStore();
  const p = t.purchases;
  const router = useRouter();
  const [filter, setFilter] = useState<ListFilter>(ListFilter.Open);
  const [data, setData] = useState<PurchaseInvoiceListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoSyncTried = useRef<boolean>(false);

  const load = useCallback(async (): Promise<PurchaseInvoiceListResponse | null> => {
    setLoading(true);
    try {
      const res = await fetch(`${PURCHASE_API.list}?filter=${filter}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body: PurchaseInvoiceListResponse = await res.json();
      setData(body);
      return body;
    } catch {
      setError(p.errorGeneric);
      return null;
    } finally {
      setLoading(false);
    }
  }, [filter, p.errorGeneric]);

  const sync = useCallback(async (): Promise<void> => {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(PURCHASE_API.list, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const result: PurchaseSyncResult = await res.json();
      if (!result.skipped) setMessage(p.syncDone(result.imported, result.autoPosted));
      await load();
    } catch {
      setError(p.errorGeneric);
    } finally {
      setSyncing(false);
    }
  }, [load, p]);

  useEffect(() => {
    void load().then((body) => {
      if (!body || autoSyncTried.current || !body.live) return;
      autoSyncTried.current = true;
      const last: number = body.lastSyncedAt ? new Date(body.lastSyncedAt).getTime() : 0;
      if (Date.now() - last > STALE_SYNC_MS) void sync();
    });
    // `sync` is stable for the page lifetime except on language change; auto-sync runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const invoices = data?.invoices ?? [];

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link
        href="/admin/stock"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.admin.backToStockHub}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{p.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{p.intro}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <Link href="/admin/stock/supplier-mappings">
              <Button variant="outline">{p.mappingsLink}</Button>
            </Link>
            <Button onClick={() => void sync()} disabled={syncing || data?.live === false}>
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              {syncing ? p.checking : p.checkNow}
            </Button>
          </div>
          <span className="text-xs text-gray-500">
            {data?.lastSyncedAt ? p.lastSync(formatDateTime(data.lastSyncedAt, locale)) : p.neverSynced}
          </span>
        </div>
      </div>

      {data?.live === false && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {p.mockMode}
        </p>
      )}
      {message && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
        {[ListFilter.Open, ListFilter.All].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900",
            )}
          >
            {f === ListFilter.Open ? `${p.filterOpen} (${data?.openInvoiceCount ?? 0})` : p.filterAll}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">{p.colInvoice}</th>
              <th className="px-4 py-3">{p.colSupplier}</th>
              <th className="px-4 py-3">{p.colDate}</th>
              <th className="px-4 py-3 text-right">{p.colTotal}</th>
              <th className="px-4 py-3">{p.colLines}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden />
                </td>
              </tr>
            )}
            {!loading && invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {filter === ListFilter.Open ? p.empty : p.emptyAll}
                </td>
              </tr>
            )}
            {invoices.map((inv) => {
              const total: number = Object.values(inv.lineCounts).reduce((a, b) => a + b, 0);
              const done: number =
                inv.lineCounts[PurchaseLineStatus.Posted] + inv.lineCounts[PurchaseLineStatus.Ignored];
              return (
                <tr
                  key={inv.id}
                  onClick={() => router.push(`/admin/stock/incoming-invoices/${inv.id}`)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {inv.seria} {inv.number}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{inv.supplierName ?? inv.supplierIdno ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatDate(inv.deliveryDate ?? inv.issueDate, locale)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {inv.totalAmount != null ? `${formatMdl(inv.totalAmount, locale)} MDL` : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-700">{p.linesProgress(done, total)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                        STATUS_TONE[inv.status],
                      )}
                    >
                      {p.invoiceStatus[inv.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
