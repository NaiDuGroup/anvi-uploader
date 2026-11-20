"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  ExternalLink,
  Flame,
  Loader2,
  LocateFixed,
  MessageCircle,
  Pencil,
  Send,
  UserCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { formatOrderLineItemRef } from "@/app/admin/_lib/orderLines";
import { STATUS_VARIANT_MAP, TRIGGER_COLORS } from "@/app/admin/_lib/orderStatus";
import type { OrderStatus } from "@/lib/validations";
import { isLineProductionStatus, type LineProductionStatus } from "@/lib/orderLineProductionStatus";
import { lineTypeKey, lineTypeLabel, PRODUCT_TYPE_ICONS } from "@/lib/productTypeIcons";
import { visibleHistoryEntries } from "@/lib/orderHistoryFormat";
import { ordersListSearchHref } from "@/lib/workshopBoard/orderOverviewAccess";
import type { WorkshopOrderOverview, WorkshopOrderOverviewLine } from "@/lib/workshopBoard/orderOverviewTypes";
import { LINE_STATUS_BADGE_CLASS } from "../OrderLineStatusBadges";
import { HistoryRow } from "../HistoryPanel";
import { DealerUrgencyBadge } from "../DealerUrgencyBadge";
import { BoardLineFacts } from "./BoardLineFacts";
import { FileThumbnailStrip } from "./BoardFiles";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; data: WorkshopOrderOverview };

function orderStatusClass(status: string): string {
  const variant = STATUS_VARIANT_MAP[status as OrderStatus] ?? "outline";
  return (TRIGGER_COLORS[variant] ?? TRIGGER_COLORS.outline!).replace(/\s*hover:\S+/g, "");
}

/**
 * «Весь заказ»: right-side panel over the workshop board with every line of
 * one order, its notes and recent history. Read-only; the server leaves out
 * money for the workshop (`GET /api/workshop-board/order/[id]`).
 */
export function OrderOverviewDrawer({
  orderId,
  focusLineId,
  linesOnBoard,
  escSuspended,
  onClose,
  onShowOnBoard,
  onOpenComments,
}: {
  orderId: string;
  /** The board line the panel was opened from: highlighted + scrolled to. */
  focusLineId: string | null;
  /** `orderLineId`s of this order the board shows now. */
  linesOnBoard: ReadonlySet<string>;
  /** Another dialog above the panel handles Esc (lightbox, comments). */
  escSuspended: boolean;
  onClose: () => void;
  onShowOnBoard: () => void;
  onOpenComments: (orderId: string, orderNumber: number) => void;
}) {
  const { t, locale } = useLanguageStore();
  const p = t.orderPanel;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const focusRef = useRef<HTMLLIElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/workshop-board/order/${encodeURIComponent(orderId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: "ok", data: (await res.json()) as WorkshopOrderOverview });
    } catch {
      setState({ kind: "error" });
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (escSuspended) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [escSuspended, onClose]);

  const loaded = state.kind === "ok" ? state.data : null;
  useEffect(() => {
    if (loaded) focusRef.current?.scrollIntoView({ block: "center" });
  }, [loaded]);

  const orderNo = loaded ? String(loaded.order.orderNumber).padStart(4, "0") : "…";
  const onBoardCount = loaded ? loaded.lines.filter((l) => linesOnBoard.has(l.orderLineId)).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="order-overview-drawer">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={p.title(orderNo)}
        className="relative flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl"
      >
        {/* Header */}
        <div className="border-b bg-gray-50 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">{p.title(orderNo)}</h2>
                {loaded ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      orderStatusClass(loaded.order.status),
                    )}
                    title={p.orderStatus}
                  >
                    {(t.statuses as Record<string, string>)[loaded.order.status] ?? loaded.order.status}
                  </span>
                ) : null}
                {loaded?.order.isPrio ? (
                  <span className="inline-flex items-center gap-0.5 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-red-700">
                    <Flame className="h-2.5 w-2.5" aria-hidden />
                    {p.urgent}
                  </span>
                ) : null}
                {loaded?.order.dealerUrgency ? (
                  <DealerUrgencyBadge orderId={loaded.order.id} urgency={loaded.order.dealerUrgency} t={t} allowWaive={false} />
                ) : null}
              </div>
              {loaded ? <OrderHeaderFacts data={loaded} /> : null}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label={p.close}
              title={p.close}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {state.kind === "loading" && (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {p.loading}
            </p>
          )}
          {state.kind === "error" && (
            <div className="py-10 text-center">
              <p className="text-sm text-red-600">{p.loadFailed}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {p.retry}
              </button>
            </div>
          )}
          {loaded && (
            <div className="space-y-5">
              {loaded.order.issueReason && loaded.order.status === "ISSUE" ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">{p.issue}:</span> {loaded.order.issueReason}
                  </span>
                </p>
              ) : null}

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {p.linesTitle(loaded.lines.length)}
                </h3>
                <ul className="space-y-2">
                  {loaded.lines.map((line) => (
                    <OverviewLine
                      key={line.orderLineId}
                      line={line}
                      orderNumber={loaded.order.orderNumber}
                      focused={line.orderLineId === focusLineId}
                      onBoard={linesOnBoard.has(line.orderLineId)}
                      itemRef={line.orderLineId === focusLineId ? focusRef : undefined}
                    />
                  ))}
                </ul>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{p.notes}</h3>
                  <button
                    type="button"
                    onClick={() => onOpenComments(loaded.order.id, loaded.order.orderNumber)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    title={p.openComments}
                  >
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                    {p.comments(loaded.order.commentCount)}
                  </button>
                </div>
                {loaded.order.notes ? (
                  <p className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{loaded.order.notes}</p>
                ) : (
                  <p className="text-xs text-gray-400">{p.noNotes}</p>
                )}
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {p.history}
                  {loaded.history.length > 0 ? (
                    <span className="font-normal normal-case tracking-normal text-gray-400">
                      · {p.historyLatest(loaded.history.length)}
                    </span>
                  ) : null}
                </h3>
                {loaded.history.length === 0 ? (
                  <p className="text-xs text-gray-400">{p.noHistory}</p>
                ) : (
                  <div className="relative">
                    <div className="absolute bottom-3 left-[13px] top-3 w-px bg-gray-200" />
                    <ul className="space-y-3">
                      {visibleHistoryEntries(loaded.history).map((entry) => (
                        <HistoryRow key={entry.id} entry={entry} locale={locale} t={t} />
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {loaded && (
          <div className="space-y-2 border-t bg-white px-4 py-3">
            {onBoardCount < loaded.lines.length ? (
              <p className="text-[11px] text-gray-500" data-testid="order-overview-board-note">
                {onBoardCount === 0 ? p.noneOnBoard : p.someOnBoard(onBoardCount, loaded.lines.length)}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onShowOnBoard}
                disabled={onBoardCount === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <LocateFixed className="h-3.5 w-3.5" aria-hidden />
                {p.showOnBoard}
              </button>
              {loaded.order.canEdit ? (
                <a
                  href={`/admin/orders/${loaded.order.id}/edit`}
                  target="_blank"
                  rel="noopener"
                  title={p.newTab}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {p.edit}
                </a>
              ) : null}
              <a
                href={ordersListSearchHref(loaded.order.orderNumber)}
                target="_blank"
                rel="noopener"
                title={p.newTab}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                {p.openInList}
              </a>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function OrderHeaderFacts({ data }: { data: WorkshopOrderOverview }) {
  const { t } = useLanguageStore();
  const p = t.orderPanel;
  const o = data.order;
  return (
    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
      <p>
        <a href={`tel:${o.phone}`} className="font-medium text-gray-700 hover:underline">
          {o.phone}
        </a>
        {o.clientName ? <span className="ml-1 text-gray-500">· {o.clientName}</span> : null}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1" title={p.createdBy}>
          <UserCheck className="h-3 w-3 shrink-0" aria-hidden />
          {o.createdByName ?? <span className="italic">{p.byClient}</span>}
        </span>
        {(o.sentToWorkshopByName ?? o.createdByName) ? (
          <span className="inline-flex items-center gap-1" title={p.sentBy}>
            <Send className="h-3 w-3 shrink-0" aria-hidden />
            {o.sentToWorkshopByName ?? o.createdByName}
          </span>
        ) : null}
        <span title={p.createdAt}>
          {new Date(o.createdAt).toLocaleString("ru", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </p>
      {o.money ? (
        <p className="text-[11px] text-gray-500" data-testid="order-overview-money">
          {p.price}: {o.money.priceMdl != null ? t.dealerUrgency.amount(o.money.priceMdl) : "—"} ·{" "}
          <span className={o.money.isPaid ? "text-emerald-700" : "text-amber-700"}>
            {o.money.isPaid ? p.paid : p.unpaid}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function OverviewLine({
  line,
  orderNumber,
  focused,
  onBoard,
  itemRef,
}: {
  line: WorkshopOrderOverviewLine;
  orderNumber: number;
  focused: boolean;
  onBoard: boolean;
  itemRef?: React.Ref<HTMLLIElement>;
}) {
  const { t } = useLanguageStore();
  const p = t.orderPanel;
  const key = lineTypeKey(line.productType);
  const TypeIcon = key ? PRODUCT_TYPE_ICONS[key] : null;
  const status: LineProductionStatus = isLineProductionStatus(line.lineStatus) ? line.lineStatus : "WAITING";
  return (
    <li
      ref={itemRef}
      data-testid={`order-overview-line-${line.orderLineId}`}
      data-focused={focused ? "true" : undefined}
      className={cn(
        "rounded-lg border bg-white p-3",
        focused ? "border-amber-300 ring-2 ring-amber-300" : "border-gray-200",
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-gray-500">
          {formatOrderLineItemRef(orderNumber, line.lineIndex, line.totalLines)}
        </span>
        {TypeIcon && key ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-700">
            <TypeIcon className="h-3 w-3 shrink-0 text-gray-500" aria-hidden />
            {lineTypeLabel(key, t)}
          </span>
        ) : null}
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-semibold leading-none",
            LINE_STATUS_BADGE_CLASS[status],
          )}
        >
          {status === "DONE" ? <Check className="h-2.5 w-2.5" aria-hidden /> : null}
          {t.lineStatus[status]}
        </span>
        {focused ? (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            {p.openedFromHere}
          </span>
        ) : null}
        {!onBoard ? (
          <span className="rounded-md border border-dashed border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-500">
            {p.notOnBoard}
          </span>
        ) : null}
      </div>
      {line.board ? (
        <div className="mb-2">
          <BoardLineFacts line={line.board} />
        </div>
      ) : null}
      {line.files.length > 0 ? (
        <FileThumbnailStrip files={line.files} />
      ) : (
        <p className="text-[11px] text-gray-400">{p.noFiles}</p>
      )}
    </li>
  );
}
