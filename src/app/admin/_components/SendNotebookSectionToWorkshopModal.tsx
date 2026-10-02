"use client";

/**
 * Modal that drives the "assemble + send to workshop" flow for the notebook
 * section of `/admin/workshop-board`.
 *
 * Lifecycle:
 *   open   → take snapshot of the section, split tiles into ≤ 8-slot
 *            batches, show stats + Start/Cancel buttons
 *   start  → run `runNotebookSectionBatch`, forward progress to a live bar
 *   done   → render success summary, Close button triggers a parent-side
 *            board refresh via `onClose(didWork)`.
 *
 * All compose / fetch / status work is isolated in the pure runner — this
 * component only renders and threads progress.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Send, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { NOTEBOOK_BATCH_MAX_FILES } from "@/lib/notebook/composeNotebookBatchPng";
import type { WorkshopBoardSection } from "@/lib/workshopBoard/types";
import {
  flattenNotebookSectionTiles,
  filterTilesReadyForBatch,
  splitNotebookTilesIntoBatches,
  type NotebookBatchTileFromSection,
} from "@/lib/workshopBoard/notebookBatchFromSection";
import {
  runNotebookSectionBatch,
  type BatchProgress,
  type BatchRunResult,
} from "@/lib/workshopBoard/runNotebookSectionBatch";

interface Props {
  section: WorkshopBoardSection;
  /**
   * Called when the modal should close. `didWork === true` iff at least one
   * PNG was generated / status flipped — the parent uses this to decide
   * whether to refresh the board.
   */
  onClose: (didWork: boolean) => void;
}

interface Snapshot {
  freshTiles: NotebookBatchTileFromSection[];
  staleTiles: NotebookBatchTileFromSection[];
  batches: NotebookBatchTileFromSection[][];
  freshOrderCount: number;
}

type Phase =
  | { kind: "ready" }
  | { kind: "running"; progress: BatchProgress }
  | { kind: "done"; result: BatchRunResult };

function buildSnapshot(section: WorkshopBoardSection): Snapshot {
  const allTiles = flattenNotebookSectionTiles(section);
  // Status map: iterate groups once; `line.status` is authoritative.
  const statusByOrderId = new Map<string, string>();
  for (const g of section.groups) {
    for (const l of g.lines) {
      // Keep the "worst" status if the same order appears in several lines —
      // but WorkshopBoard already dedupes by orderLineId, so this is a safety net.
      statusByOrderId.set(l.orderId, l.status);
    }
  }
  const fresh = filterTilesReadyForBatch(allTiles, statusByOrderId);
  const freshIds = new Set(fresh.map((t) => t.orderLineId));
  const stale = allTiles.filter((t) => !freshIds.has(t.orderLineId));
  const batches = splitNotebookTilesIntoBatches(
    fresh,
    NOTEBOOK_BATCH_MAX_FILES,
  );
  const freshOrderCount = new Set(fresh.map((t) => t.orderId)).size;
  return { freshTiles: fresh, staleTiles: stale, batches, freshOrderCount };
}

export default function SendNotebookSectionToWorkshopModal({
  section,
  onClose,
}: Props) {
  const { t } = useLanguageStore();

  // Snapshot the section once at mount — new orders landing afterwards
  // show up on the next CTA click.
  const [snapshot] = useState<Snapshot>(() => buildSnapshot(section));
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const didWorkRef = useRef(false);

  const canStart =
    snapshot.freshTiles.length >= 2 && phase.kind === "ready";
  const isRunning = phase.kind === "running";
  const isDone = phase.kind === "done";

  const close = useCallback(() => {
    if (isRunning) return; // never close mid-run
    onClose(didWorkRef.current);
  }, [isRunning, onClose]);

  // Esc + overlay click (disabled while running).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  const handleStart = useCallback(async (): Promise<void> => {
    if (!canStart) return;
    setPhase({
      kind: "running",
      progress: {
        stage: "fetching",
        current: 0,
        total: snapshot.freshTiles.length,
      },
    });
    try {
      const result = await runNotebookSectionBatch({
        tilesInBatches: snapshot.batches,
        onProgress: (progress) => {
          setPhase({ kind: "running", progress });
        },
      });
      if (result.batchesGenerated > 0 || result.statusesUpdated > 0) {
        didWorkRef.current = true;
      }
      setPhase({ kind: "done", result });
    } catch (error) {
      // Should never happen (runner is defensively wrapped), but just in
      // case: surface a done-with-zero-generated so the operator sees
      // something.
      console.error("runNotebookSectionBatch threw:", error);
      setPhase({
        kind: "done",
        result: {
          batchesGenerated: 0,
          batchesFailed: snapshot.batches.length,
          totalTiles: snapshot.freshTiles.length,
          fetchFailures: 0,
          statusesUpdated: 0,
          statusesFailed: 0,
          uploadFailures: 0,
        },
      });
    }
  }, [canStart, snapshot.batches, snapshot.freshTiles.length]);

  const progressPct = useMemo(() => {
    if (phase.kind !== "running") return 0;
    const { current, total } = phase.progress;
    if (total <= 0) return 0;
    return Math.min(100, Math.round((current / total) * 100));
  }, [phase]);

  const stageLabel = (() => {
    if (phase.kind !== "running") return "";
    const copy = t.workshopBoard;
    switch (phase.progress.stage) {
      case "fetching":
        return copy.sendNotebookSectionProgressFetch(
          phase.progress.current,
          phase.progress.total,
        );
      case "composing":
        return copy.sendNotebookSectionProgressCompose(
          phase.progress.current,
          phase.progress.total,
        );
      case "updating-status":
        return copy.sendNotebookSectionProgressStatus(
          phase.progress.current,
          phase.progress.total,
        );
      case "done":
        return copy.sendNotebookSectionDone;
      default:
        return "";
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-nb-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={close}
      />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-gray-900">
        <button
          type="button"
          onClick={close}
          disabled={isRunning}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={t.workshopBoard.sendNotebookSectionClose}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <Send className="w-5 h-5 text-emerald-600" />
          <h2 id="send-nb-modal-title" className="text-lg font-bold">
            {t.workshopBoard.sendNotebookSectionTitle}
          </h2>
        </div>

        {/* ── Stats (ready + running + done share them) */}
        <div className="space-y-2 mb-5 text-sm">
          <StatRow
            label={t.workshopBoard.sendNotebookSectionFreshStat(
              snapshot.freshTiles.length,
              snapshot.freshOrderCount,
            )}
            tone="emerald"
          />
          {snapshot.staleTiles.length > 0 && (
            <StatRow
              label={t.workshopBoard.sendNotebookSectionSkippedStat(
                snapshot.staleTiles.length,
              )}
              tone="gray"
            />
          )}
          <StatRow
            label={t.workshopBoard.sendNotebookSectionBatchStat(
              snapshot.batches.length,
            )}
            tone="indigo"
          />
        </div>

        {/* ── Running: progress bar */}
        {isRunning && (
          <div className="mb-5">
            <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {stageLabel}
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Done: result summary.  If NOTHING landed (zero PNG + zero
         *   status updates), swap the panel to a red failure variant so the
         *   operator doesn't see a green checkmark on a 100 %-failed run. */}
        {isDone && (() => {
          const fullyFailed =
            phase.result.batchesGenerated === 0 &&
            phase.result.statusesUpdated === 0;
          const panelClass = fullyFailed
            ? "border-red-100 bg-red-50"
            : "border-emerald-100 bg-emerald-50";
          const headlineClass = fullyFailed
            ? "text-red-900"
            : "text-emerald-900";
          const bulletsClass = fullyFailed
            ? "text-red-800/90"
            : "text-emerald-800/90";
          const Icon = fullyFailed ? AlertTriangle : CheckCircle2;
          const iconClass = fullyFailed ? "text-red-600" : "text-emerald-600";
          const headline = fullyFailed
            ? t.workshopBoard.sendNotebookSectionFailedTitle
            : t.workshopBoard.sendNotebookSectionDone;
          return (
            <div className={`mb-5 rounded-xl border p-3 text-sm ${panelClass}`}>
              <div className="flex items-start gap-2">
                <Icon className={`mt-0.5 w-4 h-4 shrink-0 ${iconClass}`} />
                <div>
                  <p className={`font-medium ${headlineClass}`}>{headline}</p>
                  <ul className={`mt-1 space-y-0.5 text-xs ${bulletsClass}`}>
                    <li>
                      {t.workshopBoard.sendNotebookSectionResultGenerated(
                        phase.result.batchesGenerated,
                      )}
                    </li>
                    <li>
                      {t.workshopBoard.sendNotebookSectionResultStatuses(
                        phase.result.statusesUpdated,
                      )}
                    </li>
                    {(phase.result.batchesFailed > 0 ||
                      phase.result.fetchFailures > 0 ||
                      phase.result.statusesFailed > 0 ||
                      phase.result.uploadFailures > 0) && (
                      <li className="flex items-start gap-1 pt-1 text-amber-700">
                        <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" />
                        <span>
                          {t.workshopBoard.sendNotebookSectionResultWarnings(
                            phase.result.batchesFailed +
                              phase.result.fetchFailures,
                            phase.result.statusesFailed,
                            phase.result.uploadFailures,
                          )}
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Actions */}
        <div className="flex gap-2">
          {!isDone && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={close}
              disabled={isRunning}
            >
              {t.workshopBoard.sendNotebookSectionCancel}
            </Button>
          )}
          {!isDone && (
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleStart}
              disabled={!canStart}
            >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {t.workshopBoard.sendNotebookSectionStart}
            </Button>
          )}
          {isDone && (
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={close}
            >
              {t.workshopBoard.sendNotebookSectionClose}
            </Button>
          )}
        </div>

        {/* Edge: fresh = 0 (shouldn't normally be reachable because CTA is
         *   disabled, but we handle anyway if the operator opens via keyboard). */}
        {snapshot.freshTiles.length < 2 && !isDone && (
          <p className="mt-3 text-xs text-amber-600">
            {t.workshopBoard.sendNotebookSectionNeedMore}
          </p>
        )}
      </div>
    </div>
  );
}

function StatRow({
  label,
  tone,
}: {
  label: string;
  tone: "emerald" | "gray" | "indigo";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-800 border-emerald-100"
      : tone === "indigo"
        ? "bg-indigo-50 text-indigo-800 border-indigo-100"
        : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      {label}
    </div>
  );
}
