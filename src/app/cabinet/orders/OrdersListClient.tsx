"use client";

import { useEffect, useMemo, useState } from "react";
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
  Loader2,
  MessageSquareWarning,
  Plus,
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
};

/** Visual treatment per client-visible status. */
const STATUS_STYLES: Record<
  ClientVisibleStatus,
  { Icon: LucideIcon; pill: string; dot: string; ring: string }
> = {
  inProgress: {
    Icon: Loader2,
    pill: "bg-amber-100 text-amber-900 ring-amber-200",
    dot: "bg-amber-500",
    ring: "ring-amber-200",
  },
  ready: {
    Icon: CheckCircle2,
    pill: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    dot: "bg-emerald-500",
    ring: "ring-emerald-200",
  },
  issue: {
    Icon: AlertCircle,
    pill: "bg-red-100 text-red-900 ring-red-200",
    dot: "bg-red-500",
    ring: "ring-red-200",
  },
  pendingApproval: {
    Icon: Clock,
    pill: "bg-blue-100 text-blue-900 ring-blue-200",
    dot: "bg-blue-500",
    ring: "ring-blue-200",
  },
  changesRequested: {
    Icon: MessageSquareWarning,
    pill: "bg-orange-100 text-orange-900 ring-orange-200",
    dot: "bg-orange-500",
    ring: "ring-orange-200",
  },
};

const PRODUCT_ICONS: Record<string, LucideIcon> = {
  mug: Coffee,
  notebook: BookOpen,
};

export default function OrdersListClient({
  viewer,
}: {
  viewer: { displayName: string; isDealer: boolean };
}) {
  const { t, locale } = useLanguageStore();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cabinet/orders")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { orders: OrderRow[] }) => {
        if (!cancelled) setOrders(d.orders);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const productLabel = (kind: string) =>
    kind === "mug"
      ? t.cabinet.orderProductMug
      : kind === "notebook"
        ? t.cabinet.orderProductNotebook
        : t.cabinet.orderProductPaper;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB",
        { day: "2-digit", month: "short", year: "numeric" },
      ),
    [locale],
  );

  const counterText =
    orders && orders.length > 0 ? t.cabinet.ordersCount(orders.length) : null;

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

        <Link
          href="/cabinet/orders/new"
          className="hidden h-10 items-center gap-2 self-start rounded-lg bg-gold px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gold-dark sm:inline-flex"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          {t.cabinet.newOrderButton}
        </Link>
      </header>

      {orders === null ? (
        <SkeletonGrid />
      ) : orders.length === 0 ? (
        <EmptyState
          title={t.cabinet.ordersEmpty}
          subtitle={t.cabinet.ordersEmptyHint}
          ctaLabel={t.cabinet.ordersStartNew}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {orders.map((o) => (
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
      )}
    </div>
  );
}

/** Order card — the main mobile surface for checking status at a glance. */
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
        "group flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all",
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
          <StatusIcon
            className={cn(
              "h-4 w-4",
              visibleStatus === "inProgress" && "animate-spin",
            )}
          />
          {t.clientStatuses[visibleStatus]}
        </span>
        <span className="font-mono text-xs opacity-70">#{order.orderNumber}</span>
      </div>

      <div className="flex flex-1 items-start gap-3 p-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-gray-700 ring-1 ring-inset ring-gray-200"
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
              {order.price} {t.admin.currency}
              <span
                className={cn(
                  "ml-2 text-[11px] font-medium",
                  order.isPaid ? "text-emerald-700" : "text-gray-500",
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
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center sm:py-16">
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

function SkeletonGrid() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="h-44 animate-pulse rounded-2xl border border-gray-200 bg-white"
        />
      ))}
    </ul>
  );
}
