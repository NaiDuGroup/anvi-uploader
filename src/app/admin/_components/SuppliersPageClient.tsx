"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useSuppliers, useSupplierPayments } from "@/lib/swr";
import type { SupplierKind, SupplierRow } from "@/lib/swr";
import { useDebounce } from "@/hooks/useDebounce";
import {
  getReconLabels,
  formatMoney,
  formatShortDate,
} from "@/lib/reconciliation/labels";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "./DateRangeFilter";

const PAGE_SIZE = 25;
const CUR = "MDL";

const KINDS: SupplierKind[] = ["transfers", "commissions", "all"];

export default function SuppliersPageClient() {
  const { t } = useLanguageStore();
  const locale = useLanguageStore((s) => s.locale);
  const L = getReconLabels(locale);

  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const [kind, setKind] = useState<SupplierKind>("transfers");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SupplierRow | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debounced, kind, dateFrom, dateTo]);

  const { suppliers, grandTotal, totalCount, totalPages, isLoading } =
    useSuppliers({
      query: debounced,
      kind,
      page,
      pageSize: PAGE_SIZE,
      dateFrom,
      dateTo,
    });

  const kindLabel = (k: SupplierKind) =>
    k === "transfers"
      ? L.kindTransfers
      : k === "commissions"
        ? L.kindCommissions
        : L.kindAll;

  const hasFilters = !!(query || dateFrom || dateTo);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{L.suppliersSubtitle}</p>
        <div className="grid w-full grid-cols-3 gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 md:inline-flex md:w-auto md:gap-0">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "min-h-10 rounded-md px-1.5 py-1.5 text-center text-xs font-medium leading-tight transition-colors md:min-h-0 md:px-3 md:text-sm md:leading-normal",
                kind === k
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100",
              )}
            >
              {kindLabel(k)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L.search}
            className="pl-9"
          />
        </div>
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
          locale={locale}
          t={t}
          phoneFill
          className="max-sm:w-full"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setDateFrom("");
              setDateTo("");
            }}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-500 md:min-h-0"
          >
            <X className="h-3.5 w-3.5" />
            {L.filterReset}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm md:flex-nowrap">
        <Wallet className="h-5 w-5 text-gray-400" />
        <span className="text-sm text-gray-500">{L.totalPaidLabel}:</span>
        <span className="whitespace-nowrap text-lg font-bold text-gray-900">
          {formatMoney(grandTotal, CUR, locale)}
        </span>
      </div>

      {isLoading && !suppliers ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !suppliers || suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Wallet className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-base font-medium">{L.suppliersEmpty}</p>
        </div>
      ) : (
        <>
          <ul
            className={cn(
              "space-y-2 transition-opacity md:hidden",
              isLoading && "opacity-60",
            )}
          >
            {suppliers.map((s) => (
              <li key={s.idno ?? s.name}>
                <button
                  type="button"
                  onClick={() => setSelected(s)}
                  className="block w-full rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition-colors active:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words font-medium text-gray-900">
                      {s.name}
                    </span>
                    <span className="whitespace-nowrap font-semibold tabular-nums text-gray-900">
                      {formatMoney(s.total, CUR, locale)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    <span className="whitespace-nowrap">
                      {formatShortDate(s.lastPaymentDate)}
                    </span>
                    {" · "}
                    <span className="whitespace-nowrap">
                      {L.colPaymentsCount}: {s.count}
                    </span>
                    {s.idno ? (
                      <>
                        {" · "}
                        <span className="whitespace-nowrap">{s.idno}</span>
                      </>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div
            className={cn(
              "hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm transition-opacity md:block",
              isLoading && "opacity-60",
            )}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">{L.colSupplier}</th>
                  <th className="px-4 py-3 hidden md:table-cell">{L.colIdno}</th>
                  <th className="px-4 py-3 text-right">{L.colPaymentsCount}</th>
                  <th className="px-4 py-3 text-right">{L.colTotalPaid}</th>
                  <th className="px-4 py-3 hidden lg:table-cell">
                    {L.colLastPayment}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suppliers.map((s) => (
                  <tr
                    key={s.idno ?? s.name}
                    onClick={() => setSelected(s)}
                    className="cursor-pointer transition-colors hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                      {s.idno ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {s.count}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900">
                      {formatMoney(s.total, CUR, locale)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-600">
                      {formatShortDate(s.lastPaymentDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 md:flex-nowrap md:gap-0">
            <span>{L.suppliersCount(totalCount)}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button aria-label={t.common.prevPage} title={t.common.prevPage}
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button aria-label={t.common.nextPage} title={t.common.nextPage}
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

      {selected && (
        <SupplierPaymentsDrawer
          supplier={selected}
          kind={kind}
          dateFrom={dateFrom}
          dateTo={dateTo}
          locale={locale}
          L={L}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SupplierPaymentsDrawer({
  supplier,
  kind,
  dateFrom,
  dateTo,
  locale,
  L,
  onClose,
}: {
  supplier: SupplierRow;
  kind: SupplierKind;
  dateFrom: string;
  dateTo: string;
  locale: ReturnType<typeof useLanguageStore.getState>["locale"];
  L: ReturnType<typeof getReconLabels>;
  onClose: () => void;
}) {
  const { payments, total, count, isLoading } = useSupplierPayments(
    { idno: supplier.idno, name: supplier.name },
    { kind, dateFrom, dateTo },
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-gray-100 bg-white px-4 py-4 md:gap-0 md:px-5">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-bold text-gray-900">{supplier.name}</h2>
            {supplier.idno && (
              <p className="mt-0.5 text-sm text-gray-400">{supplier.idno}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              {L.totalPaidLabel}:{" "}
              <span className="font-semibold text-gray-900">
                {formatMoney(total, CUR, locale)}
              </span>{" "}
              · {count}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 md:p-1.5"
            title={L.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !payments || payments.length === 0 ? (
          <p className="p-5 text-sm text-gray-400">{L.noPayments}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {payments.map((p) => (
              <li key={p.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-2 md:gap-0">
                  <span className="whitespace-nowrap font-semibold text-gray-900 md:whitespace-normal">
                    {formatMoney(p.amount, p.currency, locale)}
                  </span>
                  <span className="whitespace-nowrap text-xs text-gray-400 md:whitespace-normal">
                    {formatShortDate(p.bookingDate)}
                  </span>
                </div>
                {p.purpose && (
                  <div className="mt-0.5 text-gray-600">{p.purpose}</div>
                )}
                {p.documentNumber && (
                  <div className="mt-0.5 text-xs text-gray-400">
                    {L.colDoc}: {p.documentNumber}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
