"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Coffee,
  FileText,
  Maximize,
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
  files?: { id: string; fileName: string; paperType: string | null }[];
  unreadMessageCount?: number;
};

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

const CLIENT_STATUSES: readonly ClientVisibleStatus[] = [
  "inProgress",
  "readyInWorkshop",
  "readyInStudio",
  "ready",
  "issue",
] as const;

export default function OrdersListClient({
  viewer,
}: {
  viewer: { displayName: string; isDealer: boolean };
}) {
  const { t, locale } = useLanguageStore();
  const { orders: rawOrders, mutate } = useCabinetOrders();
  const orders = rawOrders as OrderRow[] | null;
  const [statusFilter, setStatusFilter] = useState<"" | ClientVisibleStatus>("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await mutate();
    } finally {
      setRefreshing(false);
    }
  };

  const productLabel = (kind: string) =>
    kind === "mug"
      ? t.cabinet.orderProductMug
      : kind === "notebook"
        ? t.cabinet.orderProductNotebook
        : kind === "large_format_print"
          ? t.cabinet.orderProductLargeFormat
          : t.cabinet.orderProductPaper;

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
    if (!orders) return [];
    const seen = new Set<ClientVisibleStatus>();
    for (const o of orders) seen.add(getClientVisibleStatus(o.status));
    return CLIENT_STATUSES.filter((s) => seen.has(s));
  }, [orders]);

  const filtered = useMemo<OrderRow[] | null>(() => {
    if (!orders) return null;
    const q = search.trim().toLowerCase();
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo
      ? new Date(`${dateTo}T23:59:59.999`).getTime()
      : null;
    return orders.filter((o) => {
      if (statusFilter && getClientVisibleStatus(o.status) !== statusFilter)
        return false;
      if (q) {
        const num = String(o.orderNumber);
        if (!num.includes(q) && !`#${num}`.includes(q)) return false;
      }
      if (fromMs !== null || toMs !== null) {
        const created = new Date(o.createdAt).getTime();
        if (fromMs !== null && created < fromMs) return false;
        if (toMs !== null && created > toMs) return false;
      }
      return true;
    });
  }, [orders, statusFilter, search, dateFrom, dateTo]);

  const filtersActive = Boolean(
    statusFilter || search.trim() || dateFrom || dateTo,
  );
  const clearFilters = () => {
    setStatusFilter("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  const counterText =
    orders && orders.length > 0 ? t.cabinet.ordersCount(orders.length) : null;

  // Outstanding balance across ALL of the customer's orders (not just the
  // filtered view) — this is the real "how much do I owe" figure.
  const { totalDue, unpaidCount } = useMemo(() => {
    if (!orders) return { totalDue: 0, unpaidCount: 0 };
    let sum = 0;
    let cnt = 0;
    for (const o of orders) {
      if (!o.isPaid && typeof o.price === "number") {
        sum += o.price;
        cnt += 1;
      }
    }
    return { totalDue: sum, unpaidCount: cnt };
  }, [orders]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t.cabinet.ordersTitle}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t.cabinet.welcome(viewer.displayName)}
            {counterText ? <span className="mx-2 text-gray-300">·</span> : null}
            {counterText ? <span>{counterText}</span> : null}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
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

      {orders === null ? (
        <SkeletonTable />
      ) : orders.length === 0 ? (
        <EmptyState
          title={t.cabinet.ordersEmpty}
          subtitle={t.cabinet.ordersEmptyHint}
          ctaLabel={t.cabinet.ordersStartNew}
        />
      ) : (
        <>
          <AmountDueSummary
            totalDue={totalDue}
            unpaidCount={unpaidCount}
            t={t}
          />

          <FiltersToolbar
            t={t}
            locale={locale}
            availableStatuses={availableStatuses}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            search={search}
            onSearchChange={setSearch}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
            }}
            filtersActive={filtersActive}
            onClear={clearFilters}
          />

          {filtered && filtered.length === 0 ? (
            <NoMatchesState message={t.cabinet.ordersNoMatches} />
          ) : (
            <>
              {/* Mobile: cards. Desktop: table. */}
              <ul className="grid gap-3 sm:hidden">
                {filtered!.map((o) => (
                  <li key={o.id}>
                    <OrderCard
                      order={o}
                      productLabel={productLabel(o.productType)}
                      date={dateFormatter.format(new Date(o.createdAt))}
                      t={t}
                    />
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-hidden rounded-lg bg-white shadow sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-3 py-3">
                        {t.cabinet.ordersColStatus}
                      </th>
                      <th className="px-3 py-3 w-20">
                        {t.cabinet.ordersColNumber}
                      </th>
                      <th className="px-3 py-3 w-32">
                        {t.cabinet.ordersColDate}
                      </th>
                      <th className="px-3 py-3">
                        {t.cabinet.ordersColProduct}
                      </th>
                      <th className="px-3 py-3 w-20 text-center">
                        {t.cabinet.ordersColFiles}
                      </th>
                      <th className="px-3 py-3 w-40 text-right">
                        {t.cabinet.ordersColAmount}
                      </th>
                      <th className="px-3 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered!.map((o) => (
                      <OrderRowDesktop
                        key={o.id}
                        order={o}
                        productLabel={productLabel(o.productType)}
                        date={dateFormatter.format(new Date(o.createdAt))}
                        t={t}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
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
        "flex items-center justify-between gap-4 rounded-lg border px-4 py-3 shadow-sm",
        hasDue
          ? "border-red-200 bg-red-50"
          : "border-emerald-200 bg-emerald-50",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
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
          <p className="text-sm text-gray-500">
            {hasDue
              ? t.cabinet.amountDueUnpaidCount(unpaidCount)
              : t.cabinet.amountDuePaidAll}
          </p>
        </div>
      </div>

      <span
        className={cn(
          "whitespace-nowrap text-xl font-bold tabular-nums sm:text-2xl",
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
  filtersActive: boolean;
  onClear: () => void;
}) {
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Search by order number */}
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              inputMode="numeric"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t.cabinet.ordersSearchPlaceholder}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-7 text-xs text-gray-800 placeholder:text-gray-400 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
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
              !filtersActive && "invisible pointer-events-none",
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
/*  Desktop table row                                                          */
/* -------------------------------------------------------------------------- */

function OrderRowDesktop({
  order,
  productLabel,
  date,
  t,
}: {
  order: OrderRow;
  productLabel: string;
  date: string;
  t: TranslationDictionary;
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
  const fileCount = order.files?.length ?? 0;

  return (
    <tr
      onClick={(e) => {
        if (e.defaultPrevented) return;
        window.location.href = `/cabinet/orders/${order.id}`;
      }}
      className="cursor-pointer border-t border-gray-100 transition-colors hover:bg-gray-50"
    >
      <td className="px-3 py-3 align-middle">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
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
      <td className="px-3 py-3 align-middle font-mono text-sm font-semibold text-gray-900">
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
      </td>
      <td className="px-3 py-3 align-middle text-xs text-gray-500 tabular-nums">
        {date}
      </td>
      <td className="px-3 py-3 align-middle">
        <span className="inline-flex items-center gap-2 text-sm text-gray-900">
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
          <span className="truncate">{productLabel}</span>
        </span>
      </td>
      <td className="px-3 py-3 align-middle text-center text-xs text-gray-700 tabular-nums">
        {fileCount > 0 ? (
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3 text-gray-400" />
            {fileCount}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-3 align-middle text-right">
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
      <td className="px-3 py-3 align-middle text-right">
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
}: {
  order: OrderRow;
  productLabel: string;
  date: string;
  t: TranslationDictionary;
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

  return (
    <Link
      href={`/cabinet/orders/${order.id}`}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-all",
        "border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
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
          <p className="truncate text-sm font-semibold text-gray-900">
            {productLabel}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{date}</p>
          {fileCount > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-500">
              <FileText className="h-3 w-3" />
              {fileCount}
            </p>
          ) : null}
        </div>
      </div>

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
    </Link>
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
