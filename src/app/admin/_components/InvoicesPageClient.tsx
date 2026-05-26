"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Filter, Loader2, Plus, Search, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { NavLinkButton } from "@/components/ui/NavLinkButton";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  INVOICE_STATUSES,
  type InvoiceStatus,
} from "@/lib/validations";
import {
  effectiveInvoiceStatus,
  formatCurrency,
  formatDate,
  invoiceStatusClasses,
  invoiceStatusLabel,
} from "@/lib/invoice/invoiceDisplay";
import { useInvoices, useInvoiceAuthors } from "@/lib/swr";
import { useDebounce } from "@/hooks/useDebounce";
import { DateRangeFilter } from "./DateRangeFilter";
import { cn } from "@/lib/utils";

/** Sentinel author filter values that are not real user ids. */
const AUTHOR_FILTER_ALL = "" as const;
const AUTHOR_FILTER_MINE = "__mine__" as const;
type AuthorFilter = typeof AUTHOR_FILTER_ALL | typeof AUTHOR_FILTER_MINE | string;

export default function InvoicesPageClient({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const router = useRouter();
  const { t, locale } = useLanguageStore();
  const [statusFilter, setStatusFilter] = useState<"" | InvoiceStatus>("");
  const [authorFilter, setAuthorFilter] = useState<AuthorFilter>(AUTHOR_FILTER_ALL);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pendingInvoiceId, setPendingInvoiceId] = useState<string | null>(null);
  const [, startInvoiceTransition] = useTransition();

  const debouncedQuery = useDebounce(query, 300);

  const resolvedCreatedById = useMemo<string | null>(() => {
    if (authorFilter === AUTHOR_FILTER_ALL) return null;
    if (authorFilter === AUTHOR_FILTER_MINE) return currentUserId;
    return authorFilter;
  }, [authorFilter, currentUserId]);

  const { invoices, error, isLoading } = useInvoices({
    status: statusFilter || undefined,
    query: debouncedQuery || undefined,
    from: from || undefined,
    to: to || undefined,
    createdById: resolvedCreatedById,
  });

  const { authors } = useInvoiceAuthors();

  const openInvoice = useCallback(
    (invoiceId: string) => {
      if (pendingInvoiceId === invoiceId) return;
      setPendingInvoiceId(invoiceId);
      startInvoiceTransition(() => {
        router.push(`/admin/invoices/${invoiceId}`);
      });
    },
    [pendingInvoiceId, router],
  );

  const filteredCount = invoices?.length ?? 0;
  const showFiltersActive = useMemo(
    () => Boolean(statusFilter || query || from || to || authorFilter !== AUTHOR_FILTER_ALL),
    [statusFilter, query, from, to, authorFilter],
  );

  const statusFilterOptions = useMemo(
    () => [
      { value: "" as const, label: t.invoices.filterStatusAll },
      ...INVOICE_STATUSES.map((s) => ({
        value: s,
        label: invoiceStatusLabel(s, t),
      })),
    ],
    [t],
  );

  const authorFilterOptions = useMemo(() => {
    const base: { value: AuthorFilter; label: string }[] = [
      { value: AUTHOR_FILTER_ALL, label: t.invoices.filterAuthorAll },
      { value: AUTHOR_FILTER_MINE, label: t.invoices.filterAuthorMine },
    ];
    const others = authors
      .filter((a) => a.id !== currentUserId)
      .map((a) => ({ value: a.id as AuthorFilter, label: a.name }));
    return [...base, ...others];
  }, [authors, currentUserId, t]);

  function clearFilters() {
    setStatusFilter("");
    setAuthorFilter(AUTHOR_FILTER_ALL);
    setQuery("");
    setFrom("");
    setTo("");
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t.invoices.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t.invoices.pageSubtitle}</p>
        </div>
        <NavLinkButton
          href="/admin/invoices/new"
          leadingIcon={<Plus className="h-4 w-4" />}
          className="shrink-0"
        >
          {t.invoices.newButton}
        </NavLinkButton>
      </header>

      <section className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="min-w-[240px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            {t.invoices.searchPlaceholder}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.invoices.searchPlaceholder}
              className="pl-9"
            />
          </div>
        </div>
        <div className="shrink-0">
          <label
            htmlFor="invoice-status-filter"
            className="mb-1 block text-xs font-medium text-gray-600"
          >
            {t.invoices.filterStatus}
          </label>
          <MenuSelect<"" | InvoiceStatus>
            id="invoice-status-filter"
            value={statusFilter}
            options={statusFilterOptions}
            onChange={(v) => setStatusFilter(v)}
            leadingIcon={<Filter className="h-3.5 w-3.5 shrink-0" />}
            buttonClassName={cn(
              "h-auto w-[180px] rounded-lg border px-2.5 py-[7px] text-xs font-medium shadow-none",
              statusFilter
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100/70"
                : "border-gray-300 bg-white text-gray-600",
            )}
          />
        </div>
        <div className="shrink-0">
          <label
            htmlFor="invoice-author-filter"
            className="mb-1 block text-xs font-medium text-gray-600"
          >
            {t.invoices.filterAuthor}
          </label>
          <MenuSelect<AuthorFilter>
            id="invoice-author-filter"
            value={authorFilter}
            options={authorFilterOptions}
            onChange={(v) => setAuthorFilter(v)}
            leadingIcon={<User className="h-3.5 w-3.5 shrink-0" />}
            buttonClassName={cn(
              "h-auto w-[200px] rounded-lg border px-2.5 py-[7px] text-xs font-medium shadow-none",
              authorFilter !== AUTHOR_FILTER_ALL
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100/70"
                : "border-gray-300 bg-white text-gray-600",
            )}
          />
        </div>
        <div className="shrink-0">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            {t.admin.filterByDate}
          </label>
          <DateRangeFilter
            dateFrom={from}
            dateTo={to}
            onChange={(nextFrom, nextTo) => {
              setFrom(nextFrom);
              setTo(nextTo);
            }}
            locale={locale}
            t={t}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          disabled={!showFiltersActive}
          tabIndex={showFiltersActive ? 0 : -1}
          aria-hidden={!showFiltersActive}
          className={cn(
            "self-end shrink-0",
            !showFiltersActive && "pointer-events-none invisible",
          )}
        >
          <X className="h-4 w-4" />
          {t.invoices.filterClear}
        </Button>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading && invoices === null ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">
            {t.invoices.listLoading}
          </p>
        ) : error ? (
          <p className="px-4 py-10 text-center text-sm text-red-600">
            {error instanceof Error ? error.message : "Failed to load"}
          </p>
        ) : filteredCount === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium text-gray-700">
              {t.invoices.listEmpty}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {t.invoices.listEmptyHint}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2.5">{t.invoices.colNumber}</th>
                <th className="px-3 py-2.5">{t.invoices.colDate}</th>
                <th className="px-3 py-2.5">{t.invoices.colClient}</th>
                <th className="px-3 py-2.5">{t.invoices.colCreatedBy}</th>
                <th className="px-3 py-2.5">{t.invoices.colStatus}</th>
                <th className="px-3 py-2.5 text-right">
                  {t.invoices.colAmount}
                </th>
                <th className="px-3 py-2.5">{t.invoices.colValidUntil}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices!.map((inv) => {
                const status = effectiveInvoiceStatus(inv);
                const isPending = pendingInvoiceId === inv.id;
                return (
                  <tr
                    key={inv.id}
                    onClick={() => openInvoice(inv.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openInvoice(inv.id);
                      }
                    }}
                    role="link"
                    tabIndex={0}
                    aria-busy={isPending}
                    className={cn(
                      "cursor-pointer hover:bg-amber-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                      isPending && "pointer-events-none opacity-70",
                    )}
                  >
                    <td className="px-3 py-2.5 font-medium text-gray-900">
                      <span className="inline-flex items-center gap-1.5">
                        {isPending && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                        )}
                        {inv.number ?? `~${inv.id.slice(0, 8)}`}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {formatDate(inv.issueDate, locale)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {inv.client.displayName}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {inv.createdBy?.name ?? t.invoices.createdByUnknown}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${invoiceStatusClasses(status)}`}
                      >
                        {invoiceStatusLabel(status, t)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                      {formatCurrency(inv.totalAmount, inv.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {inv.status === "ISSUED" || inv.status === "PAID"
                        ? formatDate(inv.validUntil, locale)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
