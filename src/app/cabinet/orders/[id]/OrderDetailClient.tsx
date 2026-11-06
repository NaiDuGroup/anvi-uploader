"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useCabinetOrderDetail, FetchError } from "@/lib/swr";
import Link from "next/link";
import {
  AlertTriangle,
  FilePen,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  History,
  LayoutGrid,
  Loader2,
  MessageCircle,
  MessageSquareQuote,
  Phone,
  Send,
  Upload,
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
import {
  isLayoutIssueReason,
  isLayoutRecentlyFixed,
  layoutIssueWaitParts,
  otherLinesProgress,
  type LayoutIssueView,
  type OtherLinesProgress,
} from "@/lib/layoutIssue";
import { otherLinesSentence } from "@/lib/layoutIssueClient";
import {
  cabinetLinePill,
  cabinetLinesDoneSummary,
  cabinetReplaceButtons,
  type CabinetLinePill,
} from "@/lib/ownerLineFileReplace";
import { ReplaceLayoutFileDialog } from "./ReplaceLayoutFileDialog";
import { formatAmountMdl } from "@/lib/money";
import { formatOrderLineItemRef } from "@/app/admin/_lib/orderLines";
import {
  AdminSkuPiecesQtyBadge,
  isCatalogSkuLine,
  skuLinePiecesQty,
} from "@/components/orders/OrderLineSummaries";
import { CabinetFilePreviewModal } from "@/app/cabinet/_components/CabinetFilePreviewModal";
import { CABINET_STATUS_STYLES } from "@/app/cabinet/_components/cabinetStatusStyles";
import { cabinetStatusHint } from "@/lib/cabinetStatusHint";
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
  orderLines?: (CabinetOrderLineView & {
    sortOrder: number;
    /** «Нужен макет»: null unless the line waits for the customer's new file. */
    layoutIssue?: LayoutIssueView | null;
    /** Last fix of a flagged line (ISO) — «✓ Новый макет получен 14:20» for 24 h. */
    layoutFixedAt?: string | null;
    /** `OrderLine.productionStatus`: the position's pill and whether the other positions are already in work. */
    productionStatus?: string | null;
    /** Step 4: «Заменить файл» on a position not started yet (`canOwnerReplaceLineFile`). */
    canReplaceFile?: boolean;
    /** Last file replacement by the owner on a waiting position (ISO). */
    ownerReplacedAt?: string | null;
  })[];
  statusTimeline?: CabinetStatusStep[];
  /** Set when the dealer cancelled the order (shown greyed «Отменён» with the reason). */
  cancelledAt?: string | null;
  cancelReason?: string | null;
  /** Last dealer edit from the cabinet. */
  dealerEditedAt?: string | null;
  /** Dealer edit / cancel buttons (`dealerOrderActionsState`); «hidden» for non-dealers. */
  dealerActions?: DealerOrderActionsState;
  dealerLockReason?: DealerModifyBlock | null;
  /** Studio pickup address from the studio info (Settings); shown under «Готов — забрать в студии». */
  studioAddress?: string | null;
};

type T = TranslationDictionary;

/** Layout / production state of one position, by line id. */
type LineLayoutState = {
  issue: LayoutIssueView | null;
  fixedAt: string | null;
  /** `OrderLine.productionStatus` (null on a cancelled order: no pills). */
  productionStatus: string | null;
  canReplaceFile: boolean;
  ownerReplacedAt: string | null;
};

/** DOM id of a position frame (the top «Нужен макет» callout scrolls to it). */
function positionDomId(lineId: string): string {
  return `cabinet-line-${lineId}`;
}

const STATUS_STYLES = CABINET_STATUS_STYLES;

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
  /** Line + file whose «Заменить файл» dialog is open (`fileId` null: a line without files). */
  const [replaceTarget, setReplaceTarget] = useState<{ lineId: string; fileId: string | null } | null>(null);

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

  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit" }),
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
  const statusHint = cabinetStatusHint(
    {
      status: visibleStatus,
      dealerActions: order.dealerActions,
      dealerLockReason: order.dealerLockReason,
      studioAddress: order.studioAddress,
    },
    t,
  );
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

  const layoutByLine = new Map<string, LineLayoutState>(
    (order.orderLines ?? []).map((l) => [
      l.id,
      {
        issue: l.layoutIssue ?? null,
        fixedAt: l.layoutFixedAt ?? null,
        productionStatus: l.productionStatus ?? null,
        canReplaceFile: l.canReplaceFile === true,
        ownerReplacedAt: l.ownerReplacedAt ?? null,
      },
    ]),
  );
  const linesDone = isCancelled ? null : cabinetLinesDoneSummary(order.orderLines);
  const anyLineReplaceable = (order.orderLines ?? []).some((l) => l.canReplaceFile === true);
  const flaggedIndexes = lines
    .map((pl, i) => (layoutByLine.get(pl.line.id)?.issue ? i : -1))
    .filter((i) => i >= 0);
  const replaceIndex = replaceTarget ? lines.findIndex((pl) => pl.line.id === replaceTarget.lineId) : -1;
  const replaceLine = replaceIndex >= 0 ? lines[replaceIndex]!.line : null;
  const replaceFile =
    replaceIndex >= 0 && replaceTarget?.fileId
      ? (lines[replaceIndex]!.files.find((f) => f.id === replaceTarget.fileId) ?? null)
      : null;
  // A flagged position keeps the «Нужен макет» dialog; a waiting one gets the plain replace.
  const replaceMode = replaceLine && layoutByLine.get(replaceLine.id)?.issue ? "layout" : "replace";

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
          <div className="flex min-w-0 flex-col items-start gap-1 sm:max-w-xs sm:items-end">
            <span
              data-testid="cabinet-order-status"
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset",
                style.pill,
              )}
            >
              <StatusIcon className="h-4 w-4" />
              {t.clientStatuses[visibleStatus]}
            </span>
            {linesDone ? (
              <span
                data-testid="cabinet-order-lines-done"
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {t.layoutIssue.linesDoneSummary(linesDone.done, linesDone.total)}
              </span>
            ) : null}
            {statusHint ? (
              <p data-testid="cabinet-order-status-hint" className="text-xs text-gray-600 sm:text-right">
                {statusHint}
              </p>
            ) : null}
          </div>
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
          waitingFilesReplaceable={anyLineReplaceable}
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

      {flaggedIndexes.length > 0 ? (
        <LayoutIssueCallout
          orderNumber={order.orderNumber}
          total={lines.length}
          indexes={flaggedIndexes}
          lineIds={flaggedIndexes.map((i) => lines[i]!.line.id)}
          t={t}
        />
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
                  layout={layoutByLine.get(pl.line.id) ?? null}
                  otherLines={otherLinesProgress(order.orderLines ?? [], pl.line.id)}
                  t={t}
                  onPreview={setPreviewFile}
                  onReplace={(fileId) => setReplaceTarget({ lineId: pl.line.id, fileId })}
                  timeFormat={(iso) => timeFormatter.format(new Date(iso))}
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

      {replaceLine ? (
        <ReplaceLayoutFileDialog
          orderId={order.id}
          lineId={replaceLine.id}
          fileId={replaceFile?.id ?? null}
          fileName={replaceFile?.fileName ?? null}
          lineCode={formatOrderLineItemRef(order.orderNumber, replaceIndex + 1, lines.length)}
          mode={replaceMode}
          declared={
            replaceLine.productType === "large_format_print" && replaceLine.largeFormatSummary
              ? {
                  widthCm: replaceLine.largeFormatSummary.widthCm,
                  heightCm: replaceLine.largeFormatSummary.heightCm,
                }
              : null
          }
          t={t}
          onDone={() => mutateOrder()}
          onClose={() => setReplaceTarget(null)}
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

/**
 * Top-of-page red callout while a position waits for the customer's new file:
 * names the position(s) and scrolls to the first one.
 */
function LayoutIssueCallout({
  orderNumber,
  total,
  indexes,
  lineIds,
  t,
}: {
  orderNumber: number;
  total: number;
  indexes: number[];
  lineIds: string[];
  t: T;
}) {
  const L = t.layoutIssue;
  const codes = indexes.map((i) => formatOrderLineItemRef(orderNumber, i + 1, total)).join(", ");
  return (
    <section
      data-testid="cabinet-order-layout-callout"
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <FilePen className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">
            {L.cabinetLineTitle}
            {total > 1 ? <span className="font-mono text-sm"> · {codes}</span> : null}
          </p>
          <p className="text-sm text-amber-800">{L.cabinetBannerHint}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          document
            .getElementById(positionDomId(lineIds[0]!))
            ?.scrollIntoView({ behavior: "smooth", block: "center" })
        }
        className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gold-dark sm:w-auto"
      >
        <Upload className="h-4 w-4" aria-hidden />
        {L.replaceButton}
      </button>
    </section>
  );
}

/** One position, framed like the staff list's line group (`#0042.1/2`). */
function PositionFrame({
  orderNumber,
  index,
  total,
  productLine,
  layout,
  otherLines,
  t,
  onPreview,
  onReplace,
  timeFormat,
}: {
  orderNumber: number;
  index: number;
  total: number;
  productLine: CabinetProductLine;
  /** «Нужен макет» / recently fixed state of this position. */
  layout: LineLayoutState | null;
  /** Where the order's other positions stand (sentence under a flagged one). */
  otherLines: OtherLinesProgress;
  t: T;
  onPreview: (f: CabinetPreviewFile) => void;
  /** Open the replace dialog for one file of this position (null: the position has no file). */
  onReplace: (fileId: string | null) => void;
  /** «14:20» for the fixed notice. */
  timeFormat: (iso: string) => string;
}) {
  const { line, files } = productLine;
  const issue = layout?.issue ?? null;
  const fixedAt =
    !issue && layout?.fixedAt && isLayoutRecentlyFixed({ lineStatus: null, layoutFixedAt: layout.fixedAt })
      ? layout.fixedAt
      : null;
  const qty = isCatalogSkuLine(line.productType)
    ? skuLinePiecesQty({ productType: line.productType, files })
    : 0;
  const Icon = CABINET_PRODUCT_ICONS[line.productType] ?? FileText;
  // Per-position status (none on a cancelled order); a flagged one shows its red block instead.
  const status = layout?.productionStatus ?? null;
  const pill: CabinetLinePill | null = status ? cabinetLinePill(status) : null;
  const inWork = status === "PRINTING" || status === "DONE";
  const replacedAt = status === "WAITING" || status === "PRINTING" ? (layout?.ownerReplacedAt ?? null) : null;
  // A replace swaps one file. One file: the position's own button; several: a «Заменить» next to each file.
  const perFileReplace =
    cabinetReplaceButtons({
      flagged: Boolean(issue),
      canReplaceFile: layout?.canReplaceFile === true,
      fileCount: files.length,
    }) === "perFile";
  const replaceSingle = () => onReplace(files[0]?.id ?? null);
  return (
    <div
      id={positionDomId(line.id)}
      data-testid={issue ? `cabinet-line-layout-issue-${line.id}` : undefined}
      className={cn(
        "min-w-0 scroll-mt-24 space-y-2 rounded-lg border p-2.5 sm:p-3",
        issue
          ? "border-2 border-amber-300 bg-amber-50/60"
          : "border-gray-200 border-l-[3px] border-l-gray-400 bg-gray-50/70",
      )}
    >
      {issue ? (
        <LayoutIssueBlock
          issue={issue}
          otherLines={otherLines}
          t={t}
          onReplace={perFileReplace ? null : replaceSingle}
          lineId={line.id}
        />
      ) : null}
      {fixedAt ? (
        <p
          data-testid={`cabinet-line-layout-fixed-${line.id}`}
          className="flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"
        >
          <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {t.layoutIssue.cabinetFixedNotice(timeFormat(fixedAt))}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {formatOrderLineItemRef(orderNumber, index + 1, total)}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {cabinetLineLabel(line, t)}
        </span>
        {qty > 0 ? <AdminSkuPiecesQtyBadge qty={qty} t={t} dense /> : null}
        {pill ? <LinePill pill={pill} lineId={line.id} t={t} /> : null}
      </div>
      <div className="min-w-0">
        <CabinetLineDigest line={line} files={files} t={t} />
      </div>
      {!issue && ((layout?.canReplaceFile && !perFileReplace) || inWork || replacedAt) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {layout?.canReplaceFile && !perFileReplace ? (
            <button
              type="button"
              data-testid={`cabinet-owner-replace-${line.id}`}
              onClick={replaceSingle}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:border-gold hover:bg-amber-50/40"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {t.layoutIssue.ownerReplaceButton}
            </button>
          ) : null}
          {inWork ? (
            <span data-testid={`cabinet-line-in-work-${line.id}`} className="text-xs text-gray-400">
              {t.layoutIssue.lineInWorkHint}
            </span>
          ) : null}
          {replacedAt ? (
            <span data-testid={`cabinet-line-owner-replaced-${line.id}`} className="text-xs text-gray-500">
              {t.layoutIssue.cabinetOwnerReplacedNotice(timeFormat(replacedAt))}
            </span>
          ) : null}
        </div>
      ) : null}
      {files.length > 0 ? (
        <div
          className={cn(
            "min-w-0 space-y-2 rounded-md border bg-white p-2",
            issue ? "border-amber-200" : "border-gray-100",
          )}
        >
          {issue ? (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              {t.layoutIssue.cabinetOldFile}
            </p>
          ) : null}
          {files.map((f) =>
            perFileReplace ? (
              <div key={f.id} className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <CabinetOrderFileRow file={f} t={t} onPreview={onPreview} size="md" />
                </div>
                <button
                  type="button"
                  data-testid={`cabinet-replace-file-${line.id}-${f.id}`}
                  onClick={() => onReplace(f.id)}
                  aria-label={`${t.layoutIssue.replaceFileButton}: ${f.fileName}`}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold shadow-sm transition-colors",
                    issue
                      ? "border-gold bg-gold text-white hover:bg-gold-dark"
                      : "border-gray-300 bg-white text-gray-700 hover:border-gold hover:bg-amber-50/40",
                  )}
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  {t.layoutIssue.replaceFileButton}
                </button>
              </div>
            ) : (
              <CabinetOrderFileRow key={f.id} file={f} t={t} onPreview={onPreview} size="md" />
            ),
          )}
        </div>
      ) : (
        <CabinetNoFilesNote t={t} />
      )}
    </div>
  );
}

const LINE_PILL_STYLES: Record<CabinetLinePill, string> = {
  waiting: "bg-gray-100 text-gray-700 ring-gray-300",
  printing: "bg-blue-50 text-blue-800 ring-blue-200",
  done: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  needsLayout: "bg-amber-50 text-amber-900 ring-amber-300",
};

/** «Ждёт» / «Печатается» / «Готово» / «Ждёт файл» on one position. */
function LinePill({ pill, lineId, t }: { pill: CabinetLinePill; lineId: string; t: T }) {
  return (
    <span
      data-testid={`cabinet-line-pill-${lineId}`}
      data-pill={pill}
      className={cn(
        "ml-auto inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        LINE_PILL_STYLES[pill],
      )}
    >
      {t.layoutIssue.linePill[pill]}
    </span>
  );
}

/** Head of a flagged position: what is wrong, the workshop comment, how long it waits, the fix button. */
function LayoutIssueBlock({
  issue,
  otherLines,
  lineId,
  t,
  onReplace,
}: {
  issue: LayoutIssueView;
  otherLines: OtherLinesProgress;
  lineId: string;
  t: T;
  /** The position's own fix button (one file); null on a position with several files — each file has its own «Заменить». */
  onReplace: (() => void) | null;
}) {
  const L = t.layoutIssue;
  const wait = layoutIssueWaitParts(issue.since);
  const othersText = otherLinesSentence(L, otherLines);
  const reason = isLayoutIssueReason(issue.reason) ? L.reasons[issue.reason] : issue.reason;
  return (
    <div className="space-y-2 rounded-md bg-white p-2.5 ring-1 ring-amber-200 sm:p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
        <FilePen className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        {L.cabinetLineTitle}
      </p>
      {reason ? (
        <p className="text-sm text-gray-900">
          <span className="font-semibold text-gray-600">{L.cabinetReason}: </span>
          {reason}
        </p>
      ) : null}
      {issue.note ? (
        <div className="text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {L.cabinetWorkshopComment}
          </p>
          <p className="whitespace-pre-line break-words text-gray-900">{issue.note}</p>
        </div>
      ) : null}
      <p className="text-xs font-medium text-amber-800">
        {L.cabinetPaused(L.waitFor(wait.unit, wait.value))}
        {othersText ? (
          <span className="block font-normal text-gray-600" data-testid={`cabinet-other-lines-${lineId}`}>
            {othersText}
          </span>
        ) : null}
      </p>
      {onReplace ? (
        <button
          type="button"
          data-testid={`cabinet-replace-file-${lineId}`}
          onClick={onReplace}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gold-dark sm:h-10 sm:w-auto"
        >
          <Upload className="h-4 w-4" aria-hidden />
          {L.replaceButton}
        </button>
      ) : (
        <p data-testid={`cabinet-replace-pick-hint-${lineId}`} className="text-sm font-medium text-gray-800">
          {L.replacePickFileHint}
        </p>
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
              {s.movedFromWorkshop ? t.clientStatusText.movedFromWorkshop : t.clientStatuses[s.status]}
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
