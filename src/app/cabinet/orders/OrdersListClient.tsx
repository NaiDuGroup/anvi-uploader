"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Coffee,
  Download,
  ExternalLink,
  FileText,
  Maximize,
  Gift,
  Layers,
  Link2,
  PenLine,
  CreditCard,
  Newspaper,
  Sparkles,
  Stamp,
  MessageCircle,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Store,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { TranslationDictionary } from "@/lib/i18n";
import {
  getClientVisibleStatus,
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
  CABINET_ORDER_SORTS,
  CABINET_ORDER_SORT_DEFAULT_DIR,
  CLIENT_VISIBLE_STATUSES,
  type CabinetOrderSort,
} from "@/lib/cabinetOrdersList";
import {
  OrdersPaginationBar,
  SortableTh,
  type SortDir,
} from "@/components/orders/OrdersListControls";
import { FileThumb } from "@/components/FileThumb";
import { FileMetaLine } from "@/components/FileMetaLine";
import { OrderFileLifecycleBadge } from "@/components/OrderFileLifecycleBadge";
import { CABINET_FILE_META_ENDPOINT } from "@/lib/files/useFileMeta";
import { CabinetFilePreviewModal } from "@/app/cabinet/_components/CabinetFilePreviewModal";

type OrderFileRow = {
  id: string;
  fileName: string;
  fileUrl: string;
  paperType: string | null;
  pageCount: number | null;
  copies: number;
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
  orderLines?: { id: string; productType: string }[];
  unreadMessageCount?: number;
};

type PreviewFile = { id: string; fileName: string };

/**
 * Visual treatment per client-visible status.
 *
 * Note: `inProgress` previously used a spinning Loader2 which read as "loading
 * the page" rather than "your order is being worked on". It is now a calm
 * pulsing amber dot (no spin) paired with a static Clock icon — much quieter
 * when the table has many in-progress rows.
 */
const STATUS_STYLES: Record<
  ClientVisibleStatus,
  { Icon: LucideIcon; pill: string; dot: string }
> = {
  inProgress: {
    Icon: Clock,
    pill: "bg-amber-100 text-amber-900 ring-amber-200",
    dot: "bg-amber-500",
  },
  readyInWorkshop: {
    Icon: PackageCheck,
    pill: "bg-violet-100 text-violet-900 ring-violet-200",
    dot: "bg-violet-500",
  },
  readyInStudio: {
    Icon: Store,
    pill: "bg-teal-100 text-teal-950 ring-teal-200",
    dot: "bg-teal-500",
  },
  ready: {
    Icon: CheckCircle2,
    pill: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  issue: {
    Icon: AlertCircle,
    pill: "bg-red-100 text-red-900 ring-red-200",
    dot: "bg-red-500",
  },
};

const PRODUCT_ICONS: Record<string, LucideIcon> = {
  mug: Coffee,
  notebook: BookOpen,
  large_format_print: Maximize,
  dtf_apparel: Stamp,
  uv_print: Sparkles,
  sublimation_print: Gift,
  pen: PenLine,
  business_card: CreditCard,
  flyer: Newspaper,
  mixed: Layers,
};

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

function isExternalUrl(fileUrl: string): boolean {
  return /^https?:\/\//i.test(fileUrl);
}

export default function OrdersListClient({
  viewer,
}: {
  viewer: { displayName: string; isDealer: boolean };
}) {
  const { t, locale } = useLanguageStore();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<"" | ClientVisibleStatus>("");
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
    (kind: string): string => {
      const byKind: Record<string, string> = {
        mug: t.cabinet.orderProductMug,
        notebook: t.cabinet.orderProductNotebook,
        pen: t.cabinet.orderProductPen,
        large_format_print: t.cabinet.orderProductLargeFormat,
        dtf_apparel: t.dtf.productType,
        uv_print: t.uv.productType,
        sublimation_print: t.sublimation.productType,
        business_card: t.cabinet.orderProductBusinessCard,
        flyer: t.cabinet.orderProductFlyer,
        mixed: t.cabinet.orderProductMixed,
      };
      return byKind[kind] ?? t.cabinet.orderProductPaper;
    },
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
            statusFilter={statusFilter}
            onStatusChange={(s) => {
              setStatusFilter(s);
              setPage(1);
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
                      <th className="px-3 py-3">
                        {t.cabinet.ordersColProduct}
                      </th>
                      <th className="px-3 py-3 w-[34%]">
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
  statusFilter: "" | ClientVisibleStatus;
  onStatusChange: (s: "" | ClientVisibleStatus) => void;
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
            <OrderFileRowView key={f.id} file={f} t={t} onPreview={onPreview} />
          ))}
        </div>
      ))}
    </div>
  );
}

function OrderFileRowView({
  file: f,
  t,
  onPreview,
}: {
  file: OrderFileRow;
  t: TranslationDictionary;
  onPreview: (f: PreviewFile) => void;
}) {
  const isLink = isExternalUrl(f.fileUrl);
  const open = () => onPreview({ id: f.id, fileName: f.fileName });
  return (
    <div className="flex items-center gap-1.5">
      {isLink ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-blue-100 bg-blue-50">
          <Link2 className="h-3.5 w-3.5 text-blue-500" />
        </div>
      ) : (
        <FileThumb fileId={f.id} fileName={f.fileName} onClick={open} />
      )}
      <div className="min-w-0 flex-1">
        {isLink ? (
          <a
            href={f.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-full truncate text-left text-blue-600 hover:underline"
            title={f.fileUrl}
          >
            {f.fileName}
          </a>
        ) : (
          <>
            <button
              type="button"
              onClick={open}
              className="block max-w-full truncate text-left text-blue-600 hover:underline"
              title={f.fileName}
            >
              {f.fileName}
            </button>
            <div className="flex flex-wrap items-center gap-x-2 text-[10px] leading-tight">
              {f.copies > 1 ? (
                <span className="text-gray-400">{t.cabinet.orderFileCopies(f.copies)}</span>
              ) : null}
              {f.pageCount && f.pageCount > 1 ? (
                <span className="text-gray-400">{t.cabinet.orderFilePages(f.pageCount)}</span>
              ) : null}
              <OrderFileLifecycleBadge fileUrl={f.fileUrl} />
            </div>
            <FileMetaLine
              fileId={f.id}
              hideMissing
              endpoint={CABINET_FILE_META_ENDPOINT}
              className="block truncate whitespace-nowrap text-[10px] leading-tight"
            />
          </>
        )}
      </div>
      {isLink ? (
        <a
          href={f.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
          title={t.upload.externalLink}
          aria-label={t.upload.externalLink}
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
        </a>
      ) : (
        <a
          href={`/api/cabinet/files/${f.id}/download`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
          title={t.cabinet.orderFileDownload}
          aria-label={t.cabinet.orderFileDownload}
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
        </a>
      )}
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
  const visibleStatus = getClientVisibleStatus(order.status);
  const style = STATUS_STYLES[visibleStatus];
  const Icon = style.Icon;
  const ProductIcon = PRODUCT_ICONS[order.productType] ?? FileText;
  const badgeClass = PRODUCT_BADGE[order.productType] ?? DEFAULT_PRODUCT_BADGE;

  const mugSnap =
    order.productType === "mug"
      ? parseMugProductSnapshot(order.mugProductSnapshot)
      : null;
  const accentColor = mugSnap?.bodyColorHex ?? null;

  return (
    <tr
      onClick={(e) => {
        if (e.defaultPrevented) return;
        onOpen();
      }}
      className="cursor-pointer border-t border-gray-100 transition-colors hover:bg-gray-50"
    >
      <td className="px-3 py-3 align-top">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
            style.pill,
          )}
        >
          {visibleStatus === "inProgress" ? (
            <PulsingDot className={style.dot} />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
          {t.clientStatuses[visibleStatus]}
        </span>
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
      <td className="px-3 py-3 align-top">
        <span className="inline-flex min-w-0 items-center gap-2 text-sm text-gray-900">
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
          <span className="truncate">{productLabel(order.productType)}</span>
        </span>
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
  const visibleStatus = getClientVisibleStatus(order.status);
  const style = STATUS_STYLES[visibleStatus];
  const StatusIcon = style.Icon;
  const ProductIcon = PRODUCT_ICONS[order.productType] ?? FileText;
  const badgeClass = PRODUCT_BADGE[order.productType] ?? DEFAULT_PRODUCT_BADGE;

  const mugSnap =
    order.productType === "mug"
      ? parseMugProductSnapshot(order.mugProductSnapshot)
      : null;
  const accentColor = mugSnap?.bodyColorHex ?? null;
  const fileCount = order.files?.length ?? 0;

  // The card is not one big <a>: the files list inside has its own buttons /
  // download links, which can't be nested in a link. Tapping anywhere else
  // opens the order; the title link keeps it keyboard-reachable.
  return (
    <div
      onClick={onOpen}
      className={cn(
        "group flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-all",
        "border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-4 py-3 ring-1 ring-inset",
          style.pill,
        )}
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
          {visibleStatus === "inProgress" ? (
            <PulsingDot className={style.dot} />
          ) : (
            <StatusIcon className="h-4 w-4" />
          )}
          {t.clientStatuses[visibleStatus]}
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

      <div className="flex flex-1 items-start gap-3 p-4">
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
          <p className="mt-0.5 text-xs text-gray-500">{date}</p>
        </div>
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
