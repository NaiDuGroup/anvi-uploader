"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useCabinetOrderDetail, FetchError } from "@/lib/swr";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  History,
  LayoutGrid,
  Loader2,
  MessageCircle,
  MessageSquareQuote,
  PackageCheck,
  Phone,
  Send,
  Store,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { CabinetOrderLineView } from "@/lib/cabinetOrderLineView";
import type { CabinetStatusStep } from "@/lib/cabinetOrderTimeline";
import type { ClientMessageDTO } from "@/lib/clientMessages";
import type { TranslationDictionary } from "@/lib/i18n";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  getCabinetVisibleStatus,
  type ClientVisibleStatus,
  type OrderStatus,
} from "@/lib/validations";
import type { DealerModifyBlock, DealerOrderActionsState } from "@/lib/dealerOrderModify";
import {
  DealerCancelDialog,
  DealerOrderActionsView,
  focusOrderChat,
  ORDER_CHAT_INPUT_ID,
  ORDER_CHAT_SECTION_ID,
} from "./DealerOrderActions";
import { parseMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { parseNotebookProductSnapshot } from "@/lib/notebook/notebookProductSnapshot";
import { parsePenProductSnapshot } from "@/lib/pen/penProductSnapshot";
import { cn } from "@/lib/utils";
import { formatAmountMdl } from "@/lib/money";
import { formatOrderLineItemRef } from "@/app/admin/_lib/orderLines";
import {
  AdminSkuPiecesQtyBadge,
  isCatalogSkuLine,
  skuLinePiecesQty,
} from "@/components/orders/OrderLineSummaries";
import { CabinetFilePreviewModal } from "@/app/cabinet/_components/CabinetFilePreviewModal";
import {
  CABINET_PRODUCT_ICONS,
  CabinetLineDigest,
  CabinetNoFilesNote,
  CabinetOrderFileRow,
  cabinetLineLabel,
  cabinetProductLabel,
  cabinetProductLinesOf,
  type CabinetOrderFile,
  type CabinetPreviewFile,
  type CabinetProductLine,
} from "@/app/cabinet/_components/CabinetOrderLines";

/**
 * Customer order detail, laid out like a staff order row: header with number,
 * status and money, then every position in its own frame (what it is + its
 * artwork files with the print size line), the status history and the chat.
 * Everything comes from `GET /api/cabinet/orders/[id]`, which whitelists the
 * fields — no costs, SKUs, production settings or staff names.
 */

type OrderDetail = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  productType: string;
  phone: string;
  notes: string | null;
  price: number | null;
  isPaid: boolean;
  paidAt: string | null;
  issueReason: string | null;
  approvalFeedback: string | null;
  createdAt: string;
  mugProductSnapshot: unknown;
  notebookProductSnapshot: unknown;
  penProductSnapshot: unknown;
  publicToken: string | null;
  files: CabinetOrderFile[];
  /** Customer-safe position views (`toCabinetOrderLineView`). */
  orderLines?: (CabinetOrderLineView & { sortOrder: number })[];
  statusTimeline?: CabinetStatusStep[];
  /** Set when the dealer cancelled the order (shown greyed «Отменён» with the reason). */
  cancelledAt?: string | null;
  cancelReason?: string | null;
  /** Last dealer edit from the cabinet. */
  dealerEditedAt?: string | null;
  /** Dealer edit / cancel buttons (`dealerOrderActionsState`); «hidden» for non-dealers. */
  dealerActions?: DealerOrderActionsState;
  dealerLockReason?: DealerModifyBlock | null;
};

type T = TranslationDictionary;

const STATUS_STYLES: Record<
  ClientVisibleStatus,
  { Icon: LucideIcon; pill: string; dot: string; stripe: string }
> = {
  inProgress: {
    Icon: Clock,
    pill: "bg-amber-100 text-amber-900 ring-amber-200",
    dot: "bg-amber-500",
    stripe: "bg-amber-400",
  },
  readyInWorkshop: {
    Icon: PackageCheck,
    pill: "bg-violet-100 text-violet-900 ring-violet-200",
    dot: "bg-violet-500",
    stripe: "bg-violet-400",
  },
  readyInStudio: {
    Icon: Store,
    pill: "bg-teal-100 text-teal-950 ring-teal-200",
    dot: "bg-teal-500",
    stripe: "bg-teal-400",
  },
  ready: {
    Icon: CheckCircle2,
    pill: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    dot: "bg-emerald-500",
    stripe: "bg-emerald-400",
  },
  issue: {
    Icon: AlertCircle,
    pill: "bg-red-100 text-red-900 ring-red-200",
    dot: "bg-red-500",
    stripe: "bg-red-400",
  },
  cancelled: {
    Icon: XCircle,
    pill: "bg-gray-100 text-gray-600 ring-gray-200",
    dot: "bg-gray-400",
    stripe: "bg-gray-300",
  },
};

/** Same colour chips as the staff orders table. */
const PRODUCT_BADGE: Record<string, string> = {
  mug: "bg-amber-100 text-amber-800",
  notebook: "bg-emerald-100 text-emerald-800",
  pen: "bg-pink-100 text-pink-800",
  dtf_apparel: "bg-fuchsia-100 text-fuchsia-800",
  large_format_print: "bg-sky-100 text-sky-800",
  mixed: "bg-violet-100 text-violet-900",
};
const DEFAULT_PRODUCT_BADGE = "bg-gray-100 text-gray-600";

function intlLocale(locale: string): string {
  return locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB";
}

export default function OrderDetailClient({ orderId }: { orderId: string }) {
  const { t, locale } = useLanguageStore();
  const { order: rawOrder, error: orderError, mutate: mutateOrder } = useCabinetOrderDetail(orderId);
  const order = rawOrder as OrderDetail | null;
  const notFound = orderError instanceof FetchError && orderError.status === 404;
  const [previewFile, setPreviewFile] = useState<CabinetPreviewFile | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancelOrder = useCallback(
    async (reason: string) => {
      setCancelBusy(true);
      setCancelError(null);
      try {
        const res = await fetch(`/api/cabinet/orders/${orderId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          setCancelError(
            body.code === "order_locked"
              ? t.dealerOrder.lockedNow
              : body.code === "cancel_reason_required"
                ? t.dealerOrder.cancelReasonRequired
                : t.dealerOrder.cancelFailed,
          );
          if (body.code === "order_locked") void mutateOrder();
          return;
        }
        setCancelOpen(false);
        await mutateOrder();
      } catch {
        setCancelError(t.dealerOrder.cancelFailed);
      } finally {
        setCancelBusy(false);
      }
    },
    [orderId, mutateOrder, t],
  );

  const publicToken = order?.publicToken ?? null;
  const handleCopyTrackingLink = useCallback(async () => {
    if (!publicToken) return;
    const url = `${window.location.origin}/track/${publicToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }, [publicToken]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );
  const shortDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );

  if (notFound) {
    return (
      <div className="space-y-4">
        <BackLink label={t.cabinet.orderDetailBack} />
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-500">
          {t.track.errorNotFound}
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <BackLink label={t.cabinet.orderDetailBack} />
        <div className="h-36 animate-pulse rounded-lg border border-gray-200 bg-white" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" />
        </div>
      </div>
    );
  }

  const visibleStatus = getCabinetVisibleStatus(order);
  const isCancelled = visibleStatus === "cancelled";
  const style = STATUS_STYLES[visibleStatus];
  const StatusIcon = style.Icon;
  const lines = cabinetProductLinesOf(order);
  const kinds = new Set(lines.map((l) => l.line.productType));
  const isMixed = order.productType === "mixed" || kinds.size > 1;
  const headKind = isMixed ? "mixed" : (lines[0]?.line.productType ?? order.productType);
  const ProductIcon = CABINET_PRODUCT_ICONS[headKind] ?? FileText;
  const productLabel = cabinetProductLabel(headKind, t);

  // A single stock item (one mug / notebook / pen position) is titled by its name.
  const single = lines.length === 1 ? lines[0].line : null;
  const singleSnap =
    single?.productType === "mug"
      ? parseMugProductSnapshot(single.mugProductSnapshot)
      : single?.productType === "notebook"
        ? parseNotebookProductSnapshot(single.notebookProductSnapshot)
        : single?.productType === "pen"
          ? parsePenProductSnapshot(single.penProductSnapshot)
          : null;
  const productName = singleSnap ? localizedName(singleSnap, locale) : null;
  const totalFiles = order.files.length;

  return (
    <div className="min-w-0 space-y-4">
      <BackLink label={t.cabinet.orderDetailBack} />

      {/* Header: number + product + status, then money / dates / contact. */}
      <section
        className={cn(
          "overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm",
          isCancelled && "opacity-70 grayscale",
        )}
      >
        <div className={cn("h-1", style.stripe)} aria-hidden />
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                PRODUCT_BADGE[headKind] ?? DEFAULT_PRODUCT_BADGE,
              )}
            >
              {isMixed ? <LayoutGrid className="h-5 w-5" /> : <ProductIcon className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold text-gray-500">
                #{String(order.orderNumber).padStart(4, "0")}
              </p>
              <h1 className="mt-0.5 break-words text-lg font-bold leading-tight text-gray-900 sm:text-xl">
                {productName ?? productLabel}
              </h1>
              {productName || lines.length > 1 ? (
                <p className="mt-0.5 text-xs text-gray-500">
                  {[
                    productName ? productLabel : null,
                    lines.length > 1 ? t.cabinet.ordersPositionsCount(lines.length) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 self-start whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset",
              style.pill,
            )}
          >
            <StatusIcon className="h-4 w-4" />
            {t.clientStatuses[visibleStatus]}
          </span>
        </div>

        <dl className="grid grid-cols-1 border-t border-gray-100 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <MetaCell icon={Wallet} label={t.cabinet.orderPrice}>
            {order.price != null ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-base font-semibold tabular-nums text-gray-900">
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
                {order.isPaid && order.paidAt ? (
                  <span className="w-full text-[11px] text-gray-400">
                    {t.cabinet.orderDetailPaidAt(shortDateFormatter.format(new Date(order.paidAt)))}
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </MetaCell>
          <MetaCell icon={Calendar} label={t.cabinet.orderCreatedAt}>
            <span className="text-sm font-medium tabular-nums text-gray-900">
              {dateFormatter.format(new Date(order.createdAt))}
            </span>
          </MetaCell>
          <MetaCell icon={Phone} label={t.cabinet.orderDetailContactPhone}>
            <a
              href={`tel:${order.phone}`}
              className="text-sm font-medium tabular-nums text-gray-900 hover:underline"
            >
              {order.phone}
            </a>
          </MetaCell>
          {order.publicToken ? (
            <MetaCell icon={linkCopied ? Check : Copy} label={t.success.viewStatus}>
              <button
                type="button"
                onClick={handleCopyTrackingLink}
                className={cn(
                  "text-left text-sm font-medium hover:underline",
                  linkCopied ? "text-emerald-600" : "text-blue-600",
                )}
              >
                {linkCopied ? t.common.copied : t.success.copyLink}
              </button>
            </MetaCell>
          ) : null}
        </dl>
      </section>

      {isCancelled && order.cancelledAt ? (
        <section
          data-testid="dealer-order-cancelled"
          className="flex items-start gap-2 rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-700"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">
              {t.dealerOrder.cancelledBanner(shortDateFormatter.format(new Date(order.cancelledAt)))}
            </p>
            {order.cancelReason ? (
              <p className="whitespace-pre-line break-words">
                {t.dealerOrder.cancelledReason}: {order.cancelReason}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {order.dealerActions && order.dealerActions !== "hidden" ? (
        <DealerOrderActionsView
          orderId={order.id}
          state={order.dealerActions}
          lockReason={order.dealerLockReason ?? null}
          t={t}
          onCancelClick={() => {
            setCancelError(null);
            setCancelOpen(true);
          }}
          onWriteWorkshop={focusOrderChat}
        />
      ) : null}
      {!isCancelled && order.dealerEditedAt ? (
        <p className="text-xs text-gray-500">
          {t.dealerOrder.editedAt(shortDateFormatter.format(new Date(order.dealerEditedAt)))}
        </p>
      ) : null}

      {visibleStatus === "issue" && order.issueReason ? (
        <section className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
              {t.cabinet.orderDetailIssueReason}
            </p>
            <p className="whitespace-pre-line break-words">{order.issueReason}</p>
          </div>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t.cabinet.orderDetailPositions(lines.length)}
              </h2>
              {totalFiles > 0 ? (
                <span className="text-xs text-gray-400">{t.cabinet.ordersFilesCount(totalFiles)}</span>
              ) : null}
            </div>
            <div className="space-y-3">
              {lines.map((pl, i) => (
                <PositionFrame
                  key={pl.line.id}
                  orderNumber={order.orderNumber}
                  index={i}
                  total={lines.length}
                  productLine={pl}
                  t={t}
                  onPreview={setPreviewFile}
                />
              ))}
            </div>
          </section>

          {order.notes ? (
            <NoteCard icon={FileText} title={t.cabinet.orderDetailNotes} text={order.notes} />
          ) : null}
          {order.approvalFeedback?.trim() ? (
            <NoteCard
              icon={MessageSquareQuote}
              title={t.cabinet.orderDetailApprovalFeedback}
              text={order.approvalFeedback}
              tone="amber"
            />
          ) : null}
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-20">
          {order.statusTimeline && order.statusTimeline.length > 0 ? (
            <StatusHistory
              steps={order.statusTimeline}
              t={t}
              format={(iso) => shortDateFormatter.format(new Date(iso))}
            />
          ) : null}
          <OrderMessagesSection orderId={order.id} t={t} locale={locale} />
        </div>
      </div>

      {cancelOpen ? (
        <DealerCancelDialog
          orderNumber={String(order.orderNumber).padStart(4, "0")}
          t={t}
          busy={cancelBusy}
          error={cancelError}
          onConfirm={(reason) => void handleCancelOrder(reason)}
          onClose={() => setCancelOpen(false)}
        />
      ) : null}

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

/** One position, framed like the staff list's line group (`#0042.1/2`). */
function PositionFrame({
  orderNumber,
  index,
  total,
  productLine,
  t,
  onPreview,
}: {
  orderNumber: number;
  index: number;
  total: number;
  productLine: CabinetProductLine;
  t: T;
  onPreview: (f: CabinetPreviewFile) => void;
}) {
  const { line, files } = productLine;
  const qty = isCatalogSkuLine(line.productType)
    ? skuLinePiecesQty({ productType: line.productType, files })
    : 0;
  const Icon = CABINET_PRODUCT_ICONS[line.productType] ?? FileText;
  return (
    <div className="min-w-0 space-y-2 rounded-lg border border-gray-200 border-l-[3px] border-l-gray-400 bg-gray-50/70 p-2.5 sm:p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {formatOrderLineItemRef(orderNumber, index + 1, total)}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {cabinetLineLabel(line, t)}
        </span>
        {qty > 0 ? <AdminSkuPiecesQtyBadge qty={qty} t={t} dense /> : null}
      </div>
      <div className="min-w-0">
        <CabinetLineDigest line={line} files={files} t={t} />
      </div>
      {files.length > 0 ? (
        <div className="min-w-0 space-y-2 rounded-md border border-gray-100 bg-white p-2">
          {files.map((f) => (
            <CabinetOrderFileRow key={f.id} file={f} t={t} onPreview={onPreview} size="md" />
          ))}
        </div>
      ) : (
        <CabinetNoFilesNote t={t} />
      )}
    </div>
  );
}

function StatusHistory({
  steps,
  t,
  format,
}: {
  steps: CabinetStatusStep[];
  t: T;
  format: (iso: string) => string;
}) {
  // Newest first, like the staff history panel.
  const ordered = [...steps].reverse();
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <History className="h-4 w-4" />
        {t.cabinet.orderDetailStatusHistory}
      </p>
      <ol className="relative space-y-3 border-l border-gray-200 pl-4">
        {ordered.map((s, i) => (
          <li key={`${s.status}-${s.at}`} className="relative">
            <span
              className={cn(
                "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white",
                STATUS_STYLES[s.status].dot,
              )}
              aria-hidden
            />
            <p className={cn("text-sm", i === 0 ? "font-semibold text-gray-900" : "text-gray-600")}>
              {t.clientStatuses[s.status]}
            </p>
            <p className="text-[11px] tabular-nums text-gray-400">{format(s.at)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MetaCell({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-gray-100 px-4 py-3 [&:not(:first-child)]:border-t min-[420px]:[&:nth-child(2)]:border-t-0 min-[420px]:[&:nth-child(even)]:border-l lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:border-t-0 sm:px-5">
      <dt className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function NoteCard({
  icon: Icon,
  title,
  text,
  tone = "gray",
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  tone?: "gray" | "amber";
}) {
  return (
    <section
      className={cn(
        "rounded-lg border p-4 shadow-sm",
        tone === "amber" ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white",
      )}
    >
      <p
        className={cn(
          "mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider",
          tone === "amber" ? "text-amber-700" : "text-gray-500",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>
      <p
        className={cn(
          "whitespace-pre-line break-words text-sm",
          tone === "amber" ? "text-amber-900" : "text-gray-800",
        )}
      >
        {text}
      </p>
    </section>
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

/* -------------------------------------------------------------------------- */
/*  Client <-> studio messages                                                 */
/* -------------------------------------------------------------------------- */

function OrderMessagesSection({
  orderId,
  t,
  locale,
}: {
  orderId: string;
  t: T;
  locale: string;
}) {
  const [messages, setMessages] = useState<ClientMessageDTO[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB",
        { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" },
      ),
    [locale],
  );

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/cabinet/orders/${orderId}/messages`);
      if (res.ok) setMessages((await res.json()) as ClientMessageDTO[]);
    } catch {
      /* ignore polling errors */
    }
  }, [orderId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(() => {
      if (!document.hidden) fetchMessages();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length]);

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/cabinet/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (res.ok) {
        const msg = (await res.json()) as ClientMessageDTO;
        setMessages((prev) => [...(prev ?? []), msg]);
        setText("");
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      id={ORDER_CHAT_SECTION_ID}
      className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <MessageCircle className="h-4 w-4" />
        {t.cabinet.orderDetailMessages}
      </p>

      <div className="mb-3 max-h-96 space-y-3 overflow-y-auto lg:max-h-[60vh]">
        {messages === null ? (
          <div className="space-y-2">
            <div className="h-10 w-2/3 animate-pulse rounded-lg bg-gray-100" />
            <div className="ml-auto h-10 w-1/2 animate-pulse rounded-lg bg-gray-100" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {t.cabinet.messagesEmpty}
          </p>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              t={t}
              time={timeFormatter.format(new Date(m.createdAt))}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex items-end gap-2">
        <textarea
          id={ORDER_CHAT_INPUT_ID}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={1}
          placeholder={t.cabinet.messagePlaceholder}
          className="max-h-32 min-h-[40px] flex-1 resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {sending ? t.cabinet.messageSending : t.cabinet.messageSend}
          </span>
        </button>
      </form>
    </section>
  );
}

function MessageBubble({
  message,
  t,
  time,
}: {
  message: ClientMessageDTO;
  t: T;
  time: string;
}) {
  const mine = message.isOwn;
  const author = mine
    ? t.cabinet.messagesYou
    : message.isStaff
      ? t.cabinet.messagesStudio
      : message.authorName;
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
          mine
            ? "rounded-br-sm bg-gold/15 text-gray-900"
            : "rounded-bl-sm bg-gray-100 text-gray-900",
        )}
      >
        <p className="mb-0.5 text-[11px] font-semibold text-gray-500">
          {author}
        </p>
        <p className="whitespace-pre-line break-words">{message.text}</p>
      </div>
      <p className="mt-1 px-1 text-[10px] text-gray-400">
        {time}
        {message.editedAt ? ` · ${t.cabinet.messageEdited}` : ""}
      </p>
    </div>
  );
}
