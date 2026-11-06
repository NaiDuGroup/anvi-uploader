"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FilePen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { TranslationDictionary } from "@/lib/i18n";
import {
  getCabinetVisibleStatus,
  type ClientVisibleStatus,
  type OrderStatus,
} from "@/lib/validations";
import { parseMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/app/admin/_components/DateRangeFilter";
import { formatAmountMdl } from "@/lib/money";
import { useCabinetOrders } from "@/lib/swr";
import {
  DEFAULT_ORDER_PAGE_SIZE,
  normalizeOrderPageLimit,
  type OrderPageSize,
} from "@/lib/orderPagination";
import {
  CABINET_NEEDS_LAYOUT_FILTER,
  CABINET_ORDER_SORTS,
  CABINET_ORDER_SORT_DEFAULT_DIR,
  CABINET_PICKUP_FILTER,
  CABINET_PICKUP_STATUSES,
  CLIENT_VISIBLE_STATUSES,
  type CabinetOrderSort,
  type CabinetStatusFilter,
} from "@/lib/cabinetOrdersList";
import {
  OrdersPaginationBar,
  SortableTh,
  type SortDir,
} from "@/components/orders/OrdersListControls";
import { CabinetFilePreviewModal } from "@/app/cabinet/_components/CabinetFilePreviewModal";
import {
  CABINET_PICKUP_FILTER_STYLE,
  CABINET_STATUS_STYLES,
} from "@/app/cabinet/_components/cabinetStatusStyles";
import {
  AdminSkuPiecesQtyBadge,
  isCatalogSkuLine,
  skuLinePiecesQty,
} from "@/components/orders/OrderLineSummaries";
import type { CabinetOrderLineView } from "@/lib/cabinetOrderLineView";
import {
  CABINET_PRODUCT_ICONS,
  CabinetLineDigest,
  CabinetOrderFileRow,
  cabinetLineLabel,
  cabinetProductLabel,
  cabinetProductLinesOf,
  type CabinetPreviewFile,
} from "@/app/cabinet/_components/CabinetOrderLines";

type OrderFileRow = {
  id: string;
  fileName: string;
  fileUrl: string;
  paperType: string | null;
  pageCount: number | null;
  copies: number;
  color: string;
  orderLineId: string;
};

type OrderRow = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  productType: string;
  price: number | null;
  isPaid: boolean;
  createdAt: string;
  mugProductSnapshot?: unknown;
  notebookProductSnapshot?: unknown;
  penProductSnapshot?: unknown;
  files?: OrderFileRow[];
  orderLines?: CabinetOrderLineView[];
  unreadMessageCount?: number;
  /** Dealer cancelled it: listed greyed as «Отменён», never in «De plată». */
  cancelledAt?: string | null;
  /** Lines waiting for the customer's new file («Цех просит заменить файл»): amber row, sorted first. */
  needsLayoutCount?: number;
  /** «Готово N из M» while the positions are mixed (step 4); null otherwise. */
  linesDone?: { done: number; total: number } | null;
};

/** The list's status filter: a status, the pickup quick filter or «Нужен новый макет». */
type ListStatusFilter = "" | CabinetStatusFilter | typeof CABINET_NEEDS_LAYOUT_FILTER;

/** `?status=` values the list accepts from a link (the shell banner → `needsLayout`). */
function statusFilterFromUrl(raw: string | null): ListStatusFilter | null {
  if (!raw) return null;
  if (raw === CABINET_NEEDS_LAYOUT_FILTER || raw === CABINET_PICKUP_FILTER) return raw;
  return (CLIENT_VISIBLE_STATUSES as readonly string[]).includes(raw) ? (raw as ClientVisibleStatus) : null;
}

type PreviewFile = CabinetPreviewFile;

const STATUS_STYLES = CABINET_STATUS_STYLES;

/**
 * Colored product-type badges that mirror the admin orders table
 * (amber=mug, emerald=notebook, sky=large-format, neutral=paper).
 */
const PRODUCT_BADGE: Record<string, string> = {
  mug: "bg-amber-100 text-amber-800",
  notebook: "bg-emerald-100 text-emerald-800",
  large_format_print: "bg-sky-100 text-sky-800",
};
const DEFAULT_PRODUCT_BADGE = "bg-gray-100 text-gray-600";

/** Same threshold as the staff list: from this many files the cell collapses. */
const FILES_ACCORDION_MIN = 4;
/** Files still shown while the cell is collapsed. */
const FILES_COLLAPSED_SHOWN = 2;

const PAGE_SIZE_LS_KEY = "cabinet-orders-page-size";
const SORT_LS_KEY = "cabinet-orders-sort";

function readLs(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLs(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private mode / blocked storage — the preference just isn't remembered
  }
}

export default function OrdersListClient({
  viewer,
}: {
  viewer: { displayName: string; isDealer: boolean };
}) {
  const { t, locale } = useLanguageStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStatus = statusFilterFromUrl(searchParams.get("status"));

  const [statusFilter, setStatusFilter] = useState<ListStatusFilter>(urlStatus ?? "");
  // A link to `?status=…` (the «Нужен макет» banner) while the list is already open.
  useEffect(() => {
    if (urlStatus === null) return;
    setStatusFilter(urlStatus);
    setPage(1);
  }, [urlStatus]);
  /** Drop a `?status=` the user has filtered away from, so the next banner click applies again. */
  const forgetUrlStatus = useCallback(() => {
    if (searchParams.has("status")) router.replace("/cabinet/orders", { scroll: false });
  }, [searchParams, router]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<OrderPageSize>(DEFAULT_ORDER_PAGE_SIZE);
  const [sort, setSort] = useState<CabinetOrderSort>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [refreshing, setRefreshing] = useState(false);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  // Post-mount hydration of remembered page size / sort (like the staff list).
  useEffect(() => {
    const size = readLs(PAGE_SIZE_LS_KEY);
    if (size) setPageSizeState(normalizeOrderPageLimit(size));
    const [col, dir] = (readLs(SORT_LS_KEY) ?? "").split(":");
    if ((CABINET_ORDER_SORTS as readonly string[]).includes(col ?? "")) {
      setSort(col as CabinetOrderSort);
      setSortDir(dir === "asc" ? "asc" : "desc");
    }
  }, []);

  // Search is debounced (300 ms) like the staff list; clearing applies at once.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return;
    const timer = setTimeout(
      () => {
        setSearch(next);
        setPage(1);
      },
      next ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const { data, mutate, isValidating } = useCabinetOrders({
    page,
    limit: pageSize,
    search,
    status: statusFilter,
    dateFrom,
    dateTo,
    sort,
    dir: sortDir,
  });
  const orders = (data?.orders as OrderRow[] | undefined) ?? null;
  const summary = data?.summary ?? null;

  // The server clamps an out-of-range page (e.g. after a filter shrank the list).
  useEffect(() => {
    // `data` may still be the previous page's response (keepPreviousData), so
    // only react when the requested page really is past the end.
    if (data && data.totalPages > 0 && page > data.totalPages) setPage(data.totalPages);
  }, [data, page]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await mutate();
    } finally {
      setRefreshing(false);
    }
  };

  const setPageSize = (size: OrderPageSize) => {
    setPageSizeState(size);
    setPage(1);
    writeLs(PAGE_SIZE_LS_KEY, String(size));
  };

  const applySort = useCallback((col: CabinetOrderSort, dir: SortDir) => {
    setSort(col);
    setSortDir(dir);
    setPage(1);
    writeLs(SORT_LS_KEY, `${col}:${dir}`);
  }, []);

  /** Same column flips direction; a new column starts in its natural one. */
  const toggleSort = useCallback(
    (col: CabinetOrderSort) => {
      if (col === sort) applySort(col, sortDir === "asc" ? "desc" : "asc");
      else applySort(col, CABINET_ORDER_SORT_DEFAULT_DIR[col]);
    },
    [sort, sortDir, applySort],
  );

  const productLabel = useCallback(
    (kind: string): string => cabinetProductLabel(kind, t),
    [t],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB",
        { day: "2-digit", month: "short", year: "numeric" },
      ),
    [locale],
  );

  // Only show status chips for statuses that actually appear in the user's
  // orders — there's no point offering "Issue" if they have zero of them.
  const availableStatuses = useMemo<ClientVisibleStatus[]>(() => {
    const seen = new Set(summary?.statuses ?? []);
    return CLIENT_VISIBLE_STATUSES.filter((s) => seen.has(s));
  }, [summary]);

  const filtersActive = Boolean(
    statusFilter || searchInput.trim() || dateFrom || dateTo,
  );
  const clearFilters = () => {
    setStatusFilter("");
    forgetUrlStatus();
    setSearchInput("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const allCount = summary?.allCount ?? 0;
  const counterText = allCount > 0 ? t.cabinet.ordersCount(allCount) : null;
  const loadingPage = isValidating && !refreshing;

  const pagination = data ? (
    <OrdersPaginationBar
      page={data.page}
      pageSize={pageSize}
      totalPages={data.totalPages}
      totalCount={data.totalCount}
      loading={loadingPage}
      t={t}
      setPage={setPage}
      setPageSize={setPageSize}
    />
  ) : null;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/*
        Title row: title block left, amount-due card in the middle (lg+),
        actions right. Below lg the card drops to its own full-width row
        under the title + actions so nothing overflows on phones.
      */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 lg:flex-none">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t.cabinet.ordersTitle}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t.cabinet.welcome(viewer.displayName)}
            {counterText ? <span className="mx-2 text-gray-300">·</span> : null}
            {counterText ? <span>{counterText}</span> : null}
          </p>
        </div>

        {data !== null && allCount > 0 ? (
          <div className="order-last w-full lg:order-none lg:ml-auto lg:w-auto lg:min-w-[22rem] lg:max-w-md">
            <AmountDueSummary
              totalDue={summary?.totalDue ?? 0}
              unpaidCount={summary?.unpaidCount ?? 0}
              t={t}
            />
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-2 lg:ml-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
            <span className="hidden sm:inline">{t.common.refresh}</span>
          </button>

          <Link
            href="/cabinet/orders/new"
            className="hidden h-10 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gold-dark sm:inline-flex"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            {t.cabinet.newOrderButton}
          </Link>
        </div>
      </header>

      {data === null ? (
        <SkeletonTable />
      ) : allCount === 0 ? (
        <EmptyState
          title={t.cabinet.ordersEmpty}
          subtitle={t.cabinet.ordersEmptyHint}
          ctaLabel={t.cabinet.ordersStartNew}
        />
      ) : (
        <>
          <FiltersToolbar
            t={t}
            locale={locale}
            availableStatuses={availableStatuses}
            needsLayoutCount={summary?.needsLayoutCount ?? 0}
            statusFilter={statusFilter}
            onStatusChange={(s) => {
              setStatusFilter(s);
              setPage(1);
              if (s !== urlStatus) forgetUrlStatus();
            }}
            search={searchInput}
            onSearchChange={setSearchInput}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
              setPage(1);
            }}
            sort={sort}
            sortDir={sortDir}
            onSortChange={applySort}
            filtersActive={filtersActive}
            onClear={clearFilters}
          />

          {!orders || orders.length === 0 ? (
            <NoMatchesState message={t.cabinet.ordersNoMatches} />
          ) : (
            <div
              className={cn(
                "transition-opacity",
                loadingPage && "opacity-60",
              )}
              aria-busy={loadingPage}
            >
              {/* Mobile: cards. Desktop: table. */}
              <ul className="grid gap-3 sm:hidden">
                {orders.map((o) => (
                  <li key={o.id} className="min-w-0">
                    <OrderCard
                      order={o}
                      productLabel={productLabel}
                      date={dateFormatter.format(new Date(o.createdAt))}
                      t={t}
                      onOpen={() => router.push(`/cabinet/orders/${o.id}`)}
                      onPreview={setPreviewFile}
                    />
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto rounded-lg bg-white shadow sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
                    <tr>
                      <SortableTh col="status" current={sort} dir={sortDir} onSort={toggleSort}>
                        {t.cabinet.ordersColStatus}
                      </SortableTh>
                      <SortableTh col="number" current={sort} dir={sortDir} onSort={toggleSort} className="w-24">
                        {t.cabinet.ordersColNumber}
                      </SortableTh>
                      <SortableTh col="date" current={sort} dir={sortDir} onSort={toggleSort} className="hidden w-32 lg:table-cell">
                        {t.cabinet.ordersColDate}
                      </SortableTh>
                      <th className="px-3 py-3 w-[32%]">
                        {t.cabinet.ordersColProduct}
                      </th>
                      <th className="px-3 py-3 w-[30%]">
                        {t.cabinet.ordersColFiles}
                      </th>
                      <SortableTh col="amount" current={sort} dir={sortDir} onSort={toggleSort} className="w-36 text-right [&>span]:justify-end">
                        {t.cabinet.ordersColAmount}
                      </SortableTh>
                      <th className="px-3 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <OrderRowDesktop
                        key={o.id}
                        order={o}
                        productLabel={productLabel}
                        date={dateFormatter.format(new Date(o.createdAt))}
                        t={t}
                        onOpen={() => router.push(`/cabinet/orders/${o.id}`)}
                        onPreview={setPreviewFile}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pagination}
        </>
      )}

      {previewFile ? (
        <CabinetFilePreviewModal
          file={previewFile}
          t={t}
          onClose={() => setPreviewFile(null)}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Amount-due summary                                                         */
/* -------------------------------------------------------------------------- */

function AmountDueSummary({
  totalDue,
  unpaidCount,
  t,
}: {
  totalDue: number;
  unpaidCount: number;
  t: TranslationDictionary;
}) {
  const hasDue = unpaidCount > 0 && totalDue > 0;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 shadow-sm sm:gap-4 sm:px-4",
        hasDue
          ? "border-red-200 bg-red-50"
          : "border-emerald-200 bg-emerald-50",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            hasDue ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600",
          )}
        >
          {hasDue ? (
            <Wallet className="h-5 w-5" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-wider",
              hasDue ? "text-red-700" : "text-emerald-700",
            )}
          >
            {t.cabinet.amountDue}
          </p>
          <p className="truncate text-xs text-gray-500 sm:text-sm">
            {hasDue
              ? t.cabinet.amountDueUnpaidCount(unpaidCount)
              : t.cabinet.amountDuePaidAll}
          </p>
        </div>
      </div>

      <span
        className={cn(
          "shrink-0 whitespace-nowrap text-lg font-bold tabular-nums sm:text-xl",
          hasDue ? "text-red-700" : "text-emerald-700",
        )}
      >
        {formatAmountMdl(totalDue, t.admin.currency)}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toolbar                                                                   */
/* -------------------------------------------------------------------------- */

function FiltersToolbar({
  t,
  locale,
  availableStatuses,
  needsLayoutCount,
  statusFilter,
  onStatusChange,
  search,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateChange,
  sort,
  sortDir,
  onSortChange,
  filtersActive,
  onClear,
}: {
  t: TranslationDictionary;
  locale: string;
  availableStatuses: ClientVisibleStatus[];
  needsLayoutCount: number;
  statusFilter: ListStatusFilter;
  onStatusChange: (s: ListStatusFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateChange: (from: string, to: string) => void;
  sort: CabinetOrderSort;
  sortDir: SortDir;
  onSortChange: (col: CabinetOrderSort, dir: SortDir) => void;
  filtersActive: boolean;
  onClear: () => void;
}) {
  const sortColLabel: Record<CabinetOrderSort, string> = {
    date: t.cabinet.ordersColDate,
    number: t.cabinet.ordersColNumber,
    amount: t.cabinet.ordersColAmount,
    status: t.cabinet.ordersColStatus,
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {/* Status chips */}
        <button
          type="button"
          onClick={() => onStatusChange("")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors",
            statusFilter === ""
              ? "bg-gray-900 text-white ring-gray-900"
              : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50",
          )}
        >
          {t.cabinet.ordersFilterAllStatuses}
        </button>
        {/* «Цех просит заменить файл»: orders waiting for the customer's fix (kept while selected). */}
        {needsLayoutCount > 0 || statusFilter === CABINET_NEEDS_LAYOUT_FILTER ? (
          <button
            type="button"
            data-testid="cabinet-filter-needs-layout"
            onClick={() => onStatusChange(CABINET_NEEDS_LAYOUT_FILTER)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors",
              statusFilter === CABINET_NEEDS_LAYOUT_FILTER
                ? "bg-amber-500 text-white ring-amber-500"
                : "bg-amber-50 text-amber-900 ring-amber-300 hover:bg-amber-100",
            )}
          >
            <FilePen className="h-3.5 w-3.5" aria-hidden />
            {t.layoutIssue.cabinetFilter}
            {needsLayoutCount > 0 ? <span className="tabular-nums">· {needsLayoutCount}</span> : null}
          </button>
        ) : null}
        {/* Quick filter: everything that can be picked up (workshop or studio). */}
        {availableStatuses.some((s) => CABINET_PICKUP_STATUSES.includes(s)) ? (
          <button
            type="button"
            data-testid="cabinet-filter-pickup"
            onClick={() => onStatusChange(CABINET_PICKUP_FILTER)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors",
              statusFilter === CABINET_PICKUP_FILTER
                ? `${CABINET_PICKUP_FILTER_STYLE.pill} ring-current`
                : "bg-white text-emerald-800 ring-emerald-200 hover:bg-emerald-50",
            )}
          >
            <CABINET_PICKUP_FILTER_STYLE.Icon className="h-3.5 w-3.5" />
            {t.clientStatusText.pickupFilter}
          </button>
        ) : null}
        {availableStatuses.map((s) => {
          const style = STATUS_STYLES[s];
          const Icon = style.Icon;
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onStatusChange(s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors",
                active
                  ? `${style.pill} ring-current`
                  : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.clientStatuses[s]}
            </button>
          );
        })}

        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Search by order number or file name */}
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t.cabinet.ordersSearchPlaceholder}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-7 text-base text-gray-800 placeholder:text-gray-400 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold sm:text-xs [&::-webkit-search-cancel-button]:hidden"
              autoComplete="off"
              aria-label={t.cabinet.ordersSearchPlaceholder}
            />
            {search ? (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label={t.cabinet.ordersFilterClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={onDateChange}
            locale={locale}
            t={t}
          />

          {/* Phones (no column headers) and narrow tablets (no date column) sort from a picker. */}
          <label className="relative inline-flex h-9 items-center lg:hidden">
            <span className="sr-only">{t.cabinet.ordersSortLabel}</span>
            <select
              value={`${sort}:${sortDir}`}
              onChange={(e) => {
                const [col, dir] = e.target.value.split(":");
                onSortChange(col as CabinetOrderSort, dir === "asc" ? "asc" : "desc");
              }}
              aria-label={t.cabinet.ordersSortLabel}
              className="h-9 appearance-none rounded-lg border border-gray-300 bg-white pl-2.5 pr-7 text-xs font-medium text-gray-700 shadow-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            >
              {CABINET_ORDER_SORTS.flatMap((col) =>
                (["desc", "asc"] as const).map((dir) => (
                  <option key={`${col}:${dir}`} value={`${col}:${dir}`}>
                    {sortColLabel[col]} {dir === "asc" ? "↑" : "↓"}
                  </option>
                )),
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-gray-400" />
          </label>

          {/*
            Always rendered so the toolbar width stays stable — toggling it in
            and out of the DOM made the layout jump. When no filters are active
            it's just hidden and non-interactive.
          */}
          <button
            type="button"
            onClick={onClear}
            aria-hidden={!filtersActive}
            tabIndex={filtersActive ? 0 : -1}
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700",
              // Phones: no width to keep stable, and an invisible button would
              // leave an empty row — drop it entirely.
              !filtersActive && "invisible pointer-events-none max-sm:hidden",
            )}
          >
            <X className="h-3.5 w-3.5" />
            {t.cabinet.ordersFilterClear}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Product cell (what was ordered, per position — like the staff list)       */
/* -------------------------------------------------------------------------- */

/** Positions shown in a row; the rest are counted («ещё 2 позиции»). */
const POSITIONS_SHOWN = 3;

function OrderProductCell({
  order,
  productLabel,
  t,
}: {
  order: OrderRow;
  productLabel: (kind: string) => string;
  t: TranslationDictionary;
}) {
  const lines = cabinetProductLinesOf(order);
  const multi = lines.length > 1;
  const shown = lines.slice(0, POSITIONS_SHOWN);
  const hidden = lines.length - shown.length;

  return (
    <div className="min-w-0 space-y-2">
      {shown.map(({ line, files }, i) => {
        const qty = isCatalogSkuLine(line.productType)
          ? skuLinePiecesQty({ productType: line.productType, files })
          : 0;
        const LineIcon = CABINET_PRODUCT_ICONS[line.productType] ?? FileText;
        return (
          <div
            key={line.id}
            className={cn(
              "min-w-0 space-y-1",
              multi && "border-l-2 border-gray-200 pl-2",
            )}
          >
            {multi ? (
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                <span className="tabular-nums text-gray-400">{i + 1}.</span>
                <LineIcon className="h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{cabinetLineLabel(line, t)}</span>
                {qty > 0 ? <AdminSkuPiecesQtyBadge qty={qty} t={t} dense /> : null}
              </p>
            ) : qty > 0 ? (
              <div className="flex">
                <AdminSkuPiecesQtyBadge qty={qty} t={t} dense />
              </div>
            ) : null}
            <CabinetLineDigest line={line} files={files} t={t} />
          </div>
        );
      })}
      {hidden > 0 ? (
        <p className="text-xs font-medium text-gray-500">
          {t.cabinet.ordersMorePositions(hidden)}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Files cell (mirrors the staff list's files column)                         */
/* -------------------------------------------------------------------------- */

type FileGroup = { key: string; label: string | null; files: OrderFileRow[] };

/** Orders whose positions are different products label files per position. */
function fileGroupsOf(
  order: OrderRow,
  productLabel: (kind: string) => string,
): FileGroup[] {
  const files = order.files ?? [];
  const lines = order.orderLines ?? [];
  if (new Set(lines.map((l) => l.productType)).size <= 1)
    return [{ key: "all", label: null, files }];
  const groups: FileGroup[] = lines.map((l) => ({
    key: l.id,
    label: productLabel(l.productType),
    files: files.filter((f) => f.orderLineId === l.id),
  }));
  const known = new Set(lines.map((l) => l.id));
  const rest = files.filter((f) => !known.has(f.orderLineId));
  if (rest.length) groups.push({ key: "rest", label: null, files: rest });
  return groups.filter((g) => g.files.length > 0);
}

function OrderFilesCell({
  order,
  productLabel,
  t,
  onPreview,
}: {
  order: OrderRow;
  productLabel: (kind: string) => string;
  t: TranslationDictionary;
  onPreview: (f: PreviewFile) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const groups = fileGroupsOf(order, productLabel);
  const totalFiles = groups.reduce((n, g) => n + g.files.length, 0);
  if (totalFiles === 0) return <span className="text-xs text-gray-300">—</span>;

  const collapsible = totalFiles >= FILES_ACCORDION_MIN;
  let budget = collapsible && !expanded ? FILES_COLLAPSED_SHOWN : Infinity;
  const shownGroups: FileGroup[] = [];
  for (const g of groups) {
    if (budget <= 0) break;
    const files = g.files.slice(0, budget);
    budget -= files.length;
    shownGroups.push({ ...g, files });
  }

  return (
    // Clicks inside the cell never open the order — they preview / download.
    <div
      className="min-w-0 space-y-1.5 text-xs text-gray-500"
      onClick={(e) => e.stopPropagation()}
    >
      {totalFiles > 1 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-medium text-gray-700">
            {t.cabinet.ordersFilesCount(totalFiles)}
          </span>
          {collapsible ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-gold hover:text-gold-dark"
              aria-expanded={expanded}
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  expanded && "rotate-180",
                )}
              />
              {expanded
                ? t.cabinet.ordersFilesHide
                : t.cabinet.ordersFilesShowAll(totalFiles)}
            </button>
          ) : null}
        </div>
      ) : null}
      {shownGroups.map((g) => (
        <div key={g.key} className="space-y-1">
          {g.label ? (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {g.label}
            </p>
          ) : null}
          {g.files.map((f) => (
            <CabinetOrderFileRow key={f.id} file={f} t={t} onPreview={onPreview} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Desktop table row                                                          */
/* -------------------------------------------------------------------------- */

function OrderRowDesktop({
  order,
  productLabel,
  date,
  t,
  onOpen,
  onPreview,
}: {
  order: OrderRow;
  productLabel: (kind: string) => string;
  date: string;
  t: TranslationDictionary;
  onOpen: () => void;
  onPreview: (f: PreviewFile) => void;
}) {
  const visibleStatus = getCabinetVisibleStatus(order);
  const style = STATUS_STYLES[visibleStatus];
  const Icon = style.Icon;
  const ProductIcon = CABINET_PRODUCT_ICONS[order.productType] ?? FileText;
  const badgeClass = PRODUCT_BADGE[order.productType] ?? DEFAULT_PRODUCT_BADGE;

  const mugSnap =
    order.productType === "mug"
      ? parseMugProductSnapshot(order.mugProductSnapshot)
      : null;
  const accentColor = mugSnap?.bodyColorHex ?? null;
  const positionCount = order.orderLines?.length ?? 0;
  const needsLayout = (order.needsLayoutCount ?? 0) > 0;

  return (
    <tr
      onClick={(e) => {
        if (e.defaultPrevented) return;
        onOpen();
      }}
      data-cancelled={visibleStatus === "cancelled" ? "true" : undefined}
      data-testid={needsLayout ? `cabinet-order-row-needs-layout-${order.id}` : undefined}
      className={cn(
        "cursor-pointer border-t border-gray-100 transition-colors hover:bg-gray-50",
        visibleStatus === "cancelled" && "bg-gray-50/60 text-gray-400 opacity-60",
        needsLayout && "bg-amber-50/70 shadow-[inset_4px_0_0_0_var(--color-amber-400)] hover:bg-amber-50",
      )}
    >
      <td className="px-3 py-3 align-top">
        <div className="flex flex-col items-start gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
              style.pill,
            )}
          >
            {visibleStatus === "printing" ? (
              <PulsingDot className={style.dot} />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
            {t.clientStatuses[visibleStatus]}
          </span>
          {needsLayout ? <NeedsLayoutPill t={t} /> : null}
          {order.linesDone ? <LinesDoneChip done={order.linesDone.done} total={order.linesDone.total} t={t} /> : null}
        </div>
      </td>
      <td className="px-3 py-3 align-top font-mono text-sm font-semibold text-gray-900">
        <span className="inline-flex items-center gap-1.5">
          #{String(order.orderNumber).padStart(4, "0")}
          {order.unreadMessageCount ? (
            <span
              title={t.cabinet.unreadMessages}
              className="inline-flex animate-pulse items-center gap-0.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
            >
              <MessageCircle className="h-3 w-3" />
              {order.unreadMessageCount}
            </span>
          ) : null}
        </span>
        {/* Narrow tablets: the date column is folded in here. */}
        <span className="mt-0.5 block whitespace-nowrap font-sans text-xs font-normal text-gray-500 tabular-nums lg:hidden">
          {date}
        </span>
      </td>
      <td className="hidden px-3 py-3 align-top text-xs text-gray-500 tabular-nums whitespace-nowrap lg:table-cell">
        {date}
      </td>
      <td className="max-w-0 px-3 py-3 align-top">
        <span className="flex min-w-0 items-center gap-2 text-sm text-gray-900">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              badgeClass,
            )}
            style={
              accentColor
                ? { backgroundColor: accentColor + "26" }
                : undefined
            }
          >
            <ProductIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 truncate font-medium">{productLabel(order.productType)}</span>
          {positionCount > 1 ? (
            <span className="shrink-0 text-xs text-gray-400">
              {t.cabinet.ordersPositionsCount(positionCount)}
            </span>
          ) : null}
        </span>
        <div className="mt-2">
          <OrderProductCell order={order} productLabel={productLabel} t={t} />
        </div>
      </td>
      <td className="max-w-0 px-3 py-3 align-top">
        <OrderFilesCell
          order={order}
          productLabel={productLabel}
          t={t}
          onPreview={onPreview}
        />
      </td>
      <td className="px-3 py-3 align-top text-right">
        {order.price != null ? (
          <div className="flex flex-col items-end gap-1">
            <span className="whitespace-nowrap text-sm font-semibold text-gray-900 tabular-nums">
              {formatAmountMdl(order.price, t.admin.currency)}
            </span>
            <span
              className={cn(
                "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                order.isPaid
                  ? "bg-green-50 text-green-700 ring-green-200"
                  : "bg-red-50 text-red-600 ring-red-200",
              )}
            >
              {order.isPaid ? t.cabinet.orderPaid : t.cabinet.orderUnpaid}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-3 align-top text-right">
        <Link
          href={`/cabinet/orders/${order.id}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label={t.cabinet.orderViewDetails}
          onClick={(e) => e.stopPropagation()}
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mobile card                                                                */
/* -------------------------------------------------------------------------- */

function OrderCard({
  order,
  productLabel,
  date,
  t,
  onOpen,
  onPreview,
}: {
  order: OrderRow;
  productLabel: (kind: string) => string;
  date: string;
  t: TranslationDictionary;
  onOpen: () => void;
  onPreview: (f: PreviewFile) => void;
}) {
  const visibleStatus = getCabinetVisibleStatus(order);
  const style = STATUS_STYLES[visibleStatus];
  const StatusIcon = style.Icon;
  const ProductIcon = CABINET_PRODUCT_ICONS[order.productType] ?? FileText;
  const badgeClass = PRODUCT_BADGE[order.productType] ?? DEFAULT_PRODUCT_BADGE;

  const mugSnap =
    order.productType === "mug"
      ? parseMugProductSnapshot(order.mugProductSnapshot)
      : null;
  const accentColor = mugSnap?.bodyColorHex ?? null;
  const positionCount = order.orderLines?.length ?? 0;
  const fileCount = order.files?.length ?? 0;
  const needsLayout = (order.needsLayoutCount ?? 0) > 0;

  // The card is not one big <a>: the files list inside has its own buttons /
  // download links, which can't be nested in a link. Tapping anywhere else
  // opens the order; the title link keeps it keyboard-reachable.
  return (
    <div
      onClick={onOpen}
      className={cn(
        "group flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-all",
        needsLayout
          ? "border-2 border-amber-300 hover:-translate-y-0.5 hover:shadow-md"
          : "border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md",
        visibleStatus === "cancelled" && "opacity-60 grayscale",
      )}
      data-cancelled={visibleStatus === "cancelled" ? "true" : undefined}
      data-testid={needsLayout ? `cabinet-order-row-needs-layout-${order.id}` : undefined}
    >
      {needsLayout ? (
        <div className="flex items-center gap-1.5 bg-amber-100 px-4 py-1.5 text-xs font-semibold text-amber-900">
          <FilePen className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
          {t.layoutIssue.cabinetRowLabel}
        </div>
      ) : null}
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-4 py-3 ring-1 ring-inset",
          style.pill,
        )}
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
          {visibleStatus === "printing" ? (
            <PulsingDot className={style.dot} />
          ) : (
            <StatusIcon className="h-4 w-4" />
          )}
          {t.clientStatuses[visibleStatus]}
          {order.linesDone ? (
            <span className="font-normal opacity-80" data-testid={`cabinet-order-card-lines-done-${order.id}`}>
              · {t.layoutIssue.linesDoneSummary(order.linesDone.done, order.linesDone.total)}
            </span>
          ) : null}
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs opacity-70">
          {order.unreadMessageCount ? (
            <span
              title={t.cabinet.unreadMessages}
              className="inline-flex animate-pulse items-center gap-0.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
            >
              <MessageCircle className="h-3 w-3" />
              {order.unreadMessageCount}
            </span>
          ) : null}
          #{order.orderNumber}
        </span>
      </div>

      <div className="flex items-start gap-3 px-4 pb-2 pt-4">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            badgeClass,
          )}
          style={
            accentColor
              ? { backgroundColor: accentColor + "26" /* ~15% opacity */ }
              : undefined
          }
        >
          <ProductIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/cabinet/orders/${order.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-sm font-semibold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {productLabel(order.productType)}
          </Link>
          <p className="mt-0.5 text-xs text-gray-500">
            {date}
            {positionCount > 1 ? ` · ${t.cabinet.ordersPositionsCount(positionCount)}` : null}
          </p>
        </div>
      </div>

      <div className="min-w-0 flex-1 px-4 pb-3">
        <OrderProductCell order={order} productLabel={productLabel} t={t} />
      </div>

      {fileCount > 0 ? (
        <div className="cursor-default border-t border-gray-100 px-4 py-3">
          <OrderFilesCell
            order={order}
            productLabel={productLabel}
            t={t}
            onPreview={onPreview}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3">
        <div className="min-w-0">
          {order.price != null ? (
            <p className="truncate text-sm font-semibold text-gray-900">
              {formatAmountMdl(order.price, t.admin.currency)}
              <span
                className={cn(
                  "ml-2 text-[11px] font-semibold",
                  order.isPaid ? "text-green-700" : "text-red-600",
                )}
              >
                · {order.isPaid ? t.cabinet.orderPaid : t.cabinet.orderUnpaid}
              </span>
            </p>
          ) : (
            <p className="text-xs text-gray-400">—</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-700" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Bits                                                                       */
/* -------------------------------------------------------------------------- */

/** Red «Нужен новый макет» label of an order waiting for the customer's file. */
/** «Готово 1 из 3» under the status while the positions are mixed. */
function LinesDoneChip({ done, total, t }: { done: number; total: number; t: TranslationDictionary }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
      {t.layoutIssue.linesDoneSummary(done, total)}
    </span>
  );
}

function NeedsLayoutPill({ t }: { t: TranslationDictionary }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
      <FilePen className="h-3 w-3 text-amber-700" aria-hidden />
      {t.layoutIssue.cabinetRowLabel}
    </span>
  );
}

/**
 * Calm pulsing dot — replaces the spinning Loader2 we used for "in progress".
 * Two layers: a soft halo that pings outward (no infinite spin) and a solid
 * core. Reads as "live status" without grabbing focus the way a spinner does.
 */
function PulsingDot({ className }: { className: string }) {
  return (
    <span className="relative inline-flex h-2 w-2 items-center justify-center">
      <span
        className={cn(
          "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
          className,
        )}
      />
      <span
        className={cn(
          "relative inline-flex h-1.5 w-1.5 rounded-full",
          className,
        )}
      />
    </span>
  );
}

function EmptyState({
  title,
  subtitle,
  ctaLabel,
}: {
  title: string;
  subtitle: string;
  ctaLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center sm:py-16">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold-dark">
        <ClipboardList className="h-7 w-7" />
      </span>
      <div>
        <p className="text-base font-semibold text-gray-900 sm:text-lg">
          {title}
        </p>
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      </div>
      <Link
        href="/cabinet/orders/new"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gold-dark"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        {ctaLabel}
      </Link>
    </div>
  );
}

function NoMatchesState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      <Search className="h-5 w-5 text-gray-400" />
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );
}

function SkeletonTable() {
  return (
    <>
      <ul className="grid gap-3 sm:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="h-32 animate-pulse rounded-lg border border-gray-200 bg-white"
          />
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-lg bg-white shadow sm:block">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-0"
          >
            <div className="h-5 w-24 animate-pulse rounded-full bg-gray-100" />
            <div className="h-3 w-10 animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
            <div className="h-7 flex-1 animate-pulse rounded bg-gray-50" />
            <div className="h-3 w-8 animate-pulse rounded bg-gray-100" />
            <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </>
  );
}
