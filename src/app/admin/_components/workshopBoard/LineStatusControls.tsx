"use client";

import { createContext, useContext } from "react";
import { AlertTriangle, Check, FilePen, Loader2, Play, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { isLineProductionStatus, type LineProductionStatus } from "@/lib/orderLineProductionStatus";
import { canSetLineStatus, type SettableLineStatus } from "@/lib/orderStatusFromLines";
import { boardLineKey, isLegacyBoardLine } from "@/lib/workshopBoard/lineStatusClient";
import type { WorkshopBoardLine } from "@/lib/workshopBoard/types";
import { formatOrderLineItemRef } from "@/app/admin/_lib/orderLines";
import { canFlagLayoutIssue, isLayoutRecentlyFixed } from "@/lib/layoutIssue";
import { formatLayoutFixedTime, layoutIssueReasonLabel, layoutIssueWaitLabel } from "@/lib/layoutIssueClient";

/**
 * Per-line production status on the workshop board (step 2): the line's own
 * status pill («Позиция: Ждёт») plus «Начать печать» / «Напечатано» buttons
 * that change only this line.
 * The order status is re-derived by the server.
 */

export interface LineStatusContextValue {
  /** `boardLineKey` of the line being saved, or null. */
  savingKey: string | null;
  setLineStatus: (line: WorkshopBoardLine, status: SettableLineStatus) => Promise<void>;
  /** Open the «Нужен макет» modal for the line. */
  flagLayout: (line: WorkshopBoardLine) => void;
  /** «Снять отметку» (opens the in-page confirm first). */
  clearLayout: (line: WorkshopBoardLine) => Promise<void>;
  /** «Заменить файл»: opens the staff replace dialog for the line. */
  replaceLayoutFile: (line: WorkshopBoardLine) => void;
}

export const LineStatusContext = createContext<LineStatusContextValue>({
  savingKey: null,
  setLineStatus: async () => {},
  flagLayout: () => {},
  clearLayout: async () => {},
  replaceLayoutFile: () => {},
});

export function useLineStatus(): LineStatusContextValue {
  return useContext(LineStatusContext);
}

/** The line's status as shown (unknown → WAITING). */
export function shownLineStatus(line: WorkshopBoardLine): LineProductionStatus {
  return isLineProductionStatus(line.lineStatus) ? line.lineStatus : "WAITING";
}

/** The line status can be changed from the board (real line, order in the workshop phase). */
export function lineStatusEditable(line: WorkshopBoardLine): boolean {
  return !isLegacyBoardLine(line.orderLineId) && canSetLineStatus(line.status);
}

/** The line is done while its order is still on the active board: shown de-emphasised. */
export function lineDoneOnBoard(line: WorkshopBoardLine): boolean {
  return canSetLineStatus(line.status) && shownLineStatus(line) === "DONE";
}

const PILL_CLASS: Record<LineProductionStatus, string> = {
  WAITING: "border-amber-200 bg-amber-50 text-amber-800",
  NEEDS_LAYOUT: "border-violet-200 bg-violet-50 text-violet-800",
  PRINTING: "border-orange-300 bg-orange-50 text-orange-800",
  DONE: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

const DOT_CLASS: Record<LineProductionStatus, string> = {
  WAITING: "bg-amber-400",
  NEEDS_LAYOUT: "bg-violet-500",
  PRINTING: "bg-orange-500 animate-pulse",
  DONE: "bg-emerald-500",
};

export function LineStatusPill({ status, testId }: { status: LineProductionStatus; testId?: string }) {
  const { t } = useLanguageStore();
  return (
    <span
      data-testid={testId}
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none",
        PILL_CLASS[status],
      )}
    >
      {status === "DONE" ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : (
        <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[status])} aria-hidden />
      )}
      {t.lineStatus[status]}
    </span>
  );
}

/**
 * «Позиция: [pill]» + verb buttons for one board line. The pill is the state
 * (read-only label), the solid buttons are actions; every button's tooltip
 * says only this line changes. Read-only pill when the line cannot be changed here.
 */
export function LineStatusControls({ line }: { line: WorkshopBoardLine }) {
  const { t } = useLanguageStore();
  const { savingKey, setLineStatus, flagLayout, clearLayout, replaceLayoutFile } = useLineStatus();
  const status = shownLineStatus(line);
  const key = boardLineKey(line.orderId, line.orderLineId);
  const busy = savingKey === key;
  const editable = lineStatusEditable(line);
  const id = line.orderLineId;
  const lineCode = formatOrderLineItemRef(line.orderNumber, line.lineIndex, line.totalLines);
  const actionHint = t.lineStatus.lineActionHint(lineCode);

  // Solid action buttons, ≥32px tall for touch; the pill stays a small outlined label.
  const btn =
    "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold shadow-sm transition-colors disabled:cursor-wait disabled:opacity-60";

  const undoTo: SettableLineStatus | null = status === "DONE" ? "PRINTING" : status === "PRINTING" ? "WAITING" : null;
  const undoLabel = undoTo ? t.lineStatus.undoTo(t.lineStatus[undoTo]) : "";

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`line-status-controls-${id}`}>
      <span className="inline-flex items-center gap-1" title={t.lineStatus.stateHint(lineCode)}>
        <span className="text-[11px] font-medium text-gray-400">{t.lineStatus.statePrefix}</span>
        <LineStatusPill status={status} testId={`line-status-${id}`} />
      </span>
      {editable && (
        <>
          {status === "WAITING" && (
            <button
              type="button"
              disabled={busy}
              title={actionHint}
              data-testid={`line-mark-printing-${id}`}
              onClick={() => void setLineStatus(line, "PRINTING")}
              className={cn(btn, "bg-orange-500 text-white hover:bg-orange-600")}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
              {t.lineStatus.markPrinting}
            </button>
          )}
          {status !== "DONE" && status !== "NEEDS_LAYOUT" && (
            <button
              type="button"
              disabled={busy}
              title={actionHint}
              data-testid={`line-mark-done-${id}`}
              onClick={() => void setLineStatus(line, "DONE")}
              className={cn(btn, "bg-emerald-600 text-white hover:bg-emerald-700")}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
              {t.lineStatus.markDone}
            </button>
          )}
          {undoTo && (
            <button
              type="button"
              disabled={busy}
              title={actionHint}
              data-testid={`line-undo-${id}`}
              onClick={() => void setLineStatus(line, undoTo)}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-[11px] font-medium text-gray-500 underline-offset-2 transition-colors hover:bg-gray-100 hover:text-gray-700 hover:underline disabled:cursor-wait disabled:opacity-60"
            >
              {busy && status === "DONE" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
              )}
              {undoLabel}
            </button>
          )}
          {canFlagLayoutIssue(line.status, status) && (
            <button
              type="button"
              disabled={busy}
              title={t.layoutIssue.flagButtonHint(lineCode)}
              data-testid={`line-flag-layout-${id}`}
              onClick={() => flagLayout(line)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {t.layoutIssue.flagButton}
            </button>
          )}
          {status === "NEEDS_LAYOUT" && (
            <button
              type="button"
              disabled={busy}
              data-testid={`line-replace-layout-${id}`}
              onClick={() => replaceLayoutFile(line)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
            >
              <FilePen className="h-3.5 w-3.5" aria-hidden />
              {t.layoutIssue.staffReplaceButton}
            </button>
          )}
          {status === "NEEDS_LAYOUT" && (
            <button
              type="button"
              disabled={busy}
              data-testid={`line-clear-layout-${id}`}
              onClick={() => void clearLayout(line)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Undo2 className="h-3.5 w-3.5" aria-hidden />}
              {t.layoutIssue.clear}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * «Нужен макет» details under the line status: the red «Ждёт макет · reason ·
 * «comment» · ждёт 3 ч» card while flagged, or a green «✓ Макет исправлен
 * 14:20» for 24 h after the fix. Nothing otherwise.
 */
export function LineLayoutIssueInfo({ line }: { line: WorkshopBoardLine }) {
  const { t } = useLanguageStore();
  const li = t.layoutIssue;
  const id = line.orderLineId;
  if (shownLineStatus(line) === "NEEDS_LAYOUT") {
    const issue = line.layoutIssue ?? null;
    return (
      <div
        data-testid={`line-layout-issue-${id}`}
        title={li.heldHint}
        className="mt-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-900"
      >
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden />
          <span className="font-bold">{li.waitingLabel}</span>
          <span className="text-rose-300" aria-hidden>·</span>
          <span className="font-medium">{layoutIssueReasonLabel(li, issue?.reason)}</span>
          {issue?.since ? (
            <>
              <span className="text-rose-300" aria-hidden>·</span>
              <span className="tabular-nums text-rose-700">{layoutIssueWaitLabel(li, issue.since)}</span>
            </>
          ) : null}
        </p>
        {issue?.note ? <p className="mt-0.5 break-words italic text-rose-800">«{issue.note}»</p> : null}
      </div>
    );
  }
  if (line.layoutFixedAt && isLayoutRecentlyFixed(line)) {
    return (
      <p
        data-testid={`line-layout-fixed-${id}`}
        className="mt-1.5 inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
      >
        {li.fixedAt(formatLayoutFixedTime(line.layoutFixedAt))}
      </p>
    );
  }
  return null;
}
