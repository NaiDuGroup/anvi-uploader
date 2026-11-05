"use client";

import { createContext, useContext } from "react";
import { Check, Loader2, Play, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { isLineProductionStatus, type LineProductionStatus } from "@/lib/orderLineProductionStatus";
import { canSetLineStatus, type SettableLineStatus } from "@/lib/orderStatusFromLines";
import { boardLineKey, isLegacyBoardLine } from "@/lib/workshopBoard/lineStatusClient";
import type { WorkshopBoardLine } from "@/lib/workshopBoard/types";

/**
 * Per-line production status on the workshop board (step 2): the line's own
 * status pill plus «Печатается» / «Готово» buttons that change only this line.
 * The order status is re-derived by the server.
 */

export interface LineStatusContextValue {
  /** `boardLineKey` of the line being saved, or null. */
  savingKey: string | null;
  setLineStatus: (line: WorkshopBoardLine, status: SettableLineStatus) => Promise<void>;
}

export const LineStatusContext = createContext<LineStatusContextValue>({
  savingKey: null,
  setLineStatus: async () => {},
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

/** Pill + buttons for one board line. Read-only pill when the line cannot be changed here. */
export function LineStatusControls({ line }: { line: WorkshopBoardLine }) {
  const { t } = useLanguageStore();
  const { savingKey, setLineStatus } = useLineStatus();
  const status = shownLineStatus(line);
  const key = boardLineKey(line.orderId, line.orderLineId);
  const busy = savingKey === key;
  const editable = lineStatusEditable(line);
  const id = line.orderLineId;

  const btn =
    "inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-60";

  const undoTo: SettableLineStatus | null = status === "DONE" ? "PRINTING" : status === "PRINTING" ? "WAITING" : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`line-status-controls-${id}`}>
      <LineStatusPill status={status} testId={`line-status-${id}`} />
      {editable && (
        <>
          {(status === "WAITING" || status === "NEEDS_LAYOUT") && (
            <button
              type="button"
              disabled={busy}
              data-testid={`line-mark-printing-${id}`}
              onClick={() => void setLineStatus(line, "PRINTING")}
              className={cn(btn, "border-orange-300 bg-white text-orange-700 hover:bg-orange-50")}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
              {t.lineStatus.markPrinting}
            </button>
          )}
          {status !== "DONE" && (
            <button
              type="button"
              disabled={busy}
              data-testid={`line-mark-done-${id}`}
              onClick={() => void setLineStatus(line, "DONE")}
              className={cn(btn, "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50")}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
              {t.lineStatus.markDone}
            </button>
          )}
          {undoTo && (
            <button
              type="button"
              disabled={busy}
              title={`${t.lineStatus.undo}: ${t.lineStatus[undoTo]}`}
              aria-label={`${t.lineStatus.undo}: ${t.lineStatus[undoTo]}`}
              data-testid={`line-undo-${id}`}
              onClick={() => void setLineStatus(line, undoTo)}
              className={cn(btn, "w-7 justify-center border-gray-200 bg-white px-0 text-gray-400 hover:bg-gray-50 hover:text-gray-600")}
            >
              {busy && status === "DONE" ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
