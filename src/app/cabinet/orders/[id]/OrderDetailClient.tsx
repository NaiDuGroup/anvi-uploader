"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Coffee,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquareWarning,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  getClientVisibleStatus,
  type ClientVisibleStatus,
  type OrderStatus,
} from "@/lib/validations";
import { parseMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { parseNotebookProductSnapshot } from "@/lib/notebook/notebookProductSnapshot";
import { cn } from "@/lib/utils";

type OrderDetail = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  productType: string;
  phone: string;
  notes: string | null;
  price: number | null;
  isPaid: boolean;
  createdAt: string;
  mugLayoutData: unknown;
  mugProductSnapshot: unknown;
  notebookLayoutData: unknown;
  notebookProductSnapshot: unknown;
  publicToken: string | null;
  files: {
    id: string;
    fileName: string;
    fileUrl: string;
    copies: number;
    color: string;
    paperType: string | null;
    pageCount: number | null;
  }[];
};

const STATUS_STYLES: Record<
  ClientVisibleStatus,
  {
    Icon: LucideIcon;
    /** Hero gradient + text colour applied to the top status banner. */
    hero: string;
    pill: string;
  }
> = {
  inProgress: {
    Icon: Loader2,
    hero: "from-amber-100 via-amber-50 to-white text-amber-950",
    pill: "bg-amber-200/70 text-amber-950",
  },
  ready: {
    Icon: CheckCircle2,
    hero: "from-emerald-100 via-emerald-50 to-white text-emerald-950",
    pill: "bg-emerald-200/70 text-emerald-950",
  },
  issue: {
    Icon: AlertCircle,
    hero: "from-red-100 via-red-50 to-white text-red-950",
    pill: "bg-red-200/70 text-red-950",
  },
  pendingApproval: {
    Icon: Clock,
    hero: "from-blue-100 via-blue-50 to-white text-blue-950",
    pill: "bg-blue-200/70 text-blue-950",
  },
  changesRequested: {
    Icon: MessageSquareWarning,
    hero: "from-orange-100 via-orange-50 to-white text-orange-950",
    pill: "bg-orange-200/70 text-orange-950",
  },
};

const PRODUCT_ICON: Record<string, LucideIcon> = {
  mug: Coffee,
  notebook: BookOpen,
};

export default function OrderDetailClient({ orderId }: { orderId: string }) {
  const { t, locale } = useLanguageStore();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cabinet/orders/${orderId}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        if (!r.ok) throw new Error("load failed");
        return (await r.json()) as OrderDetail;
      })
      .then((data) => {
        if (!cancelled && data) setOrder(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB",
        { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" },
      ),
    [locale],
  );

  if (notFound) {
    return (
      <div className="space-y-4">
        <BackLink label={t.cabinet.orderDetailBack} />
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          {t.track.errorNotFound}
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <BackLink label={t.cabinet.orderDetailBack} />
        <div className="h-44 animate-pulse rounded-2xl border border-gray-200 bg-white" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-white"
            />
          ))}
        </div>
      </div>
    );
  }

  const visibleStatus = getClientVisibleStatus(order.status);
  const style = STATUS_STYLES[visibleStatus];
  const StatusIcon = style.Icon;
  const ProductIcon = PRODUCT_ICON[order.productType] ?? FileText;

  const productLabel =
    order.productType === "mug"
      ? t.cabinet.orderProductMug
      : order.productType === "notebook"
        ? t.cabinet.orderProductNotebook
        : t.cabinet.orderProductPaper;

  const mugSnap =
    order.productType === "mug"
      ? parseMugProductSnapshot(order.mugProductSnapshot)
      : null;
  const notebookSnap =
    order.productType === "notebook"
      ? parseNotebookProductSnapshot(order.notebookProductSnapshot)
      : null;

  const productName = mugSnap
    ? localizedName(mugSnap, locale)
    : notebookSnap
      ? localizedName(notebookSnap, locale)
      : null;

  const accentColor = mugSnap?.bodyColorHex ?? notebookSnap?.coverColorHex ?? null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <BackLink label={t.cabinet.orderDetailBack} />

      {/* Status hero — designed to be the first thing a customer sees on a phone. */}
      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br",
          "shadow-sm",
          style.hero,
        )}
      >
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-gray-700 ring-1 ring-inset ring-black/5"
              style={
                accentColor
                  ? { backgroundColor: accentColor + "33" /* ~20% opacity */ }
                  : undefined
              }
            >
              <ProductIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-mono uppercase tracking-wider opacity-70">
                #{order.orderNumber}
              </p>
              <h1 className="mt-0.5 text-xl font-bold leading-tight sm:text-2xl">
                {productName ?? productLabel}
              </h1>
              {productName ? (
                <p className="mt-0.5 text-xs opacity-70">{productLabel}</p>
              ) : null}
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-sm font-semibold",
              style.pill,
            )}
          >
            <StatusIcon
              className={cn(
                "h-4 w-4",
                visibleStatus === "inProgress" && "animate-spin",
              )}
            />
            {t.clientStatuses[visibleStatus]}
          </span>
        </div>
      </section>

      {/* Key facts in a stack-friendly grid that becomes one column on phones. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={CreditCard}
          label={t.cabinet.orderPrice}
          value={
            order.price != null ? (
              <span>
                {order.price}{" "}
                <span className="text-sm font-normal text-gray-500">
                  {t.admin.currency}
                </span>
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )
          }
          hint={
            order.price != null
              ? order.isPaid
                ? { text: t.cabinet.orderPaid, tone: "ok" }
                : { text: t.cabinet.orderUnpaid, tone: "muted" }
              : undefined
          }
        />
        <Stat
          icon={Calendar}
          label={t.cabinet.orderCreatedAt}
          value={
            <span className="text-base font-semibold text-gray-900">
              {dateFormatter.format(new Date(order.createdAt))}
            </span>
          }
        />
        <Stat
          icon={Phone}
          label={t.common.phone}
          value={
            <a
              href={`tel:${order.phone}`}
              className="text-base font-semibold text-gray-900 hover:underline"
            >
              {order.phone}
            </a>
          }
        />
        {order.publicToken ? (
          <Link
            href={`/track/${order.publicToken}`}
            className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gold/40 hover:bg-amber-50/30"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">
              <ExternalLink className="h-3.5 w-3.5" />
              {t.success.viewStatus}
            </span>
            <span className="text-sm font-semibold text-gray-900">
              {t.success.copyLink}
            </span>
          </Link>
        ) : null}
      </section>

      {order.notes ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t.cabinet.orderDetailNotes}
          </p>
          <p className="whitespace-pre-line text-sm text-gray-800">{order.notes}</p>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t.cabinet.orderDetailFiles}
        </h2>
        {order.files.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            {t.cabinet.orderDetailNoFiles}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {order.files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium text-gray-900"
                    title={f.fileName}
                  >
                    {f.fileName}
                  </p>
                  <p className="text-xs text-gray-500">
                    ×{f.copies}
                    {f.paperType ? ` · ${f.paperType}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/cabinet/orders"
      className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: { text: string; tone: "ok" | "muted" };
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <div className="text-base font-semibold text-gray-900">{value}</div>
      {hint ? (
        <span
          className={cn(
            "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
            hint.tone === "ok"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-gray-100 text-gray-600",
          )}
        >
          {hint.text}
        </span>
      ) : null}
    </div>
  );
}

/** Pick the trilingual label from a product snapshot for the active locale. */
function localizedName(
  snap: { nameRo?: string; nameRu?: string; nameEn?: string },
  locale: string,
): string | null {
  const name =
    locale === "ru"
      ? snap.nameRu
      : locale === "ro"
        ? snap.nameRo
        : snap.nameEn;
  return name?.trim() || snap.nameRo || snap.nameRu || snap.nameEn || null;
}
