"use client";

/**
 * Modal that drives the "assemble + send to workshop" flow for the mug
 * section of `/admin/workshop-board`.
 *
 * Lifecycle:
 *   open   → take snapshot of the section, split tiles into 2-slot A4 sheets,
 *            show stats + Start/Cancel buttons
 *   start  → run `runMugSectionBatch`, forward progress to a live bar
 *   done   → render success summary, Close button triggers a parent-side
 *            board refresh via `onClose(didWork)`.
 *
 * All compose / fetch / status work is isolated in the pure runner — this
 * component only renders and threads progress. Mirrors
 * `SendNotebookSectionToWorkshopModal`, except a single leftover mug is a
 * valid sheet so the start threshold is 1 rather than 2.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Send, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { MUG_SHEET_SLOTS } from "@/lib/mug/composeMugSheetPng";
import type { WorkshopBoardSection } from "@/lib/workshopBoard/types";
import {
  flattenMugSectionTiles,
  filterMugTilesReadyForBatch,
  splitMugTilesIntoSheets,
  type MugBatchTileFromSection,
} from "@/lib/workshopBoard/mugBatchFromSection";
import {
  runMugSectionBatch,
  type MugBatchProgress,
  type MugBatchRunResult,
} from "@/lib/workshopBoard/runMugSectionBatch";

interface Props {
  section: WorkshopBoardSection;
  /**
   * Called when the modal should close. `didWork === true` iff at least one
   * sheet was generated / status flipped — the parent uses this to decide
   * whether to refresh the board.
   */
  onClose: (didWork: boolean) => void;
}

interface Snapshot {
  freshTiles: MugBatchTileFromSection[];
  staleTiles: MugBatchTileFromSection[];
  sheets: MugBatchTileFromSection[][];
  freshOrderCount: number;
}

type Phase =
  | { kind: "ready" }
  | { kind: "running"; progress: MugBatchProgress }
  | { kind: "done"; result: MugBatchRunResult };

function buildSnapshot(section: WorkshopBoardSection): Snapshot {
  const allTiles = flattenMugSectionTiles(section);
  // Status map: iterate groups once; `line.status` is authoritative.
  const statusByOrderId = new Map<string, string>();
  for (const g of section.groups) {
    for (const l of g.lines) {
      statusByOrderId.set(l.orderId, l.status);
    }
  }
  const fresh = filterMugTilesReadyForBatch(allTiles, statusByOrderId);
  const freshIds = new Set(fresh.map((t) => t.orderLineId));
  const stale = allTiles.filter((t) => !freshIds.has(t.orderLineId));
  const sheets = splitMugTilesIntoSheets(fresh, MUG_SHEET_SLOTS);
  const freshOrderCount = new Set(fresh.map((t) => t.orderId)).size;
  return { freshTiles: fresh, staleTiles: stale, sheets, freshOrderCount };
}

export default function SendMugSectionToWorkshopModal({
  section,
  onClose,
}: Props) {
  const { t } = useLanguageStore();

  // Snapshot the section once at mount — new orders landing afterwards show
  // up on the next CTA click.
  const [snapshot] = useState<Snapshot>(() => buildSnapshot(section));
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const didWorkRef = useRef(false);

  const canStart = snapshot.freshTiles.length >= 1 && phase.kind === "ready";
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
      const result = await runMugSectionBatch({
        tilesInSheets: snapshot.sheets,
        onProgress: (progress) => {
          setPhase({ kind: "running", progress });
        },
      });
      if (result.sheetsGenerated > 0 || result.statusesUpdated > 0) {
        didWorkRef.current = true;
      }
      setPhase({ kind: "done", result });
    } catch (error) {
      // Should never happen (runner is defensively wrapped), but just in
      // case: surface a done-with-zero-generated so the operator sees
      // something.
      console.error("runMugSectionBatch threw:", error);
      setPhase({
        kind: "done",
        result: {
          sheetsGenerated: 0,
          sheetsFailed: snapshot.sheets.length,
          totalTiles: snapshot.freshTiles.length,
          fetchFailures: 0,
          aspectWarnings: 0,
          statusesUpdated: 0,
          statusesFailed: 0,
          uploadFailures: 0,
        },
      });
    }
  }, [canStart, snapshot.sheets, snapshot.freshTiles.length]);

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
        return copy.sendMugSectionProgressFetch(
          phase.progress.current,
          phase.progress.total,
        );
      case "composing":
        return copy.sendMugSectionProgressCompose(
          phase.progress.current,
          phase.progress.total,
        );
      case "updating-status":
        return copy.sendMugSectionProgressStatus(
          phase.progress.current,
          phase.progress.total,
        );
      case "done":
        return copy.sendMugSectionDone;
      default:
        return "";
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-mug-modal-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-gray-900">
        <button
          type="button"
          onClick={close}
          disabled={isRunning}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={t.workshopBoard.sendMugSectionClose}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <Send className="w-5 h-5 text-amber-600" />
          <h2 id="send-mug-modal-title" className="text-lg font-bold">
            {t.workshopBoard.sendMugSectionTitle}
          </h2>
        </div>

        {/* ── Stats (ready + running + done share them) */}
        <div className="space-y-2 mb-5 text-sm">
          <StatRow
            label={t.workshopBoard.sendMugSectionFreshStat(
              snapshot.freshTiles.length,
              snapshot.freshOrderCount,
            )}
            tone="amber"
          />
          {snapshot.staleTiles.length > 0 && (
            <StatRow
              label={t.workshopBoard.sendMugSectionSkippedStat(
                snapshot.staleTiles.length,
              )}
              tone="gray"
            />
          )}
          <StatRow
            label={t.workshopBoard.sendMugSectionSheetStat(
              snapshot.sheets.length,
            )}
            tone="indigo"
          />
        </div>

        <p className="mb-5 text-xs text-gray-500">
          {t.workshopBoard.sendMugSectionGeometryHint}
        </p>

        {/* ── Running: progress bar */}
        {isRunning && (
          <div className="mb-5">
            <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {stageLabel}
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Done: result summary.  If NOTHING landed (zero sheet + zero
         *   status updates), swap the panel to a red failure variant so the
         *   operator doesn't see a green checkmark on a 100 %-failed run. */}
        {isDone && (() => {
          const fullyFailed =
            phase.result.sheetsGenerated === 0 &&
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
            ? t.workshopBoard.sendMugSectionFailedTitle
            : t.workshopBoard.sendMugSectionDone;
          return (
            <div className={`mb-5 rounded-xl border p-3 text-sm ${panelClass}`}>
              <div className="flex items-start gap-2">
                <Icon className={`mt-0.5 w-4 h-4 shrink-0 ${iconClass}`} />
                <div>
                  <p className={`font-medium ${headlineClass}`}>{headline}</p>
                  <ul className={`mt-1 space-y-0.5 text-xs ${bulletsClass}`}>
                    <li>
                      {t.workshopBoard.sendMugSectionResultGenerated(
                        phase.result.sheetsGenerated,
                      )}
                    </li>
                    <li>
                      {t.workshopBoard.sendMugSectionResultStatuses(
                        phase.result.statusesUpdated,
                      )}
                    </li>
                    {phase.result.aspectWarnings > 0 && (
                      <li className="flex items-start gap-1 pt-1 text-amber-700">
                        <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" />
                        <span>
                          {t.workshopBoard.sendMugSectionResultAspectWarnings(
                            phase.result.aspectWarnings,
                          )}
                        </span>
                      </li>
                    )}
                    {(phase.result.sheetsFailed > 0 ||
                      phase.result.fetchFailures > 0 ||
                      phase.result.statusesFailed > 0 ||
                      phase.result.uploadFailures > 0) && (
                      <li className="flex items-start gap-1 pt-1 text-amber-700">
                        <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" />
                        <span>
                          {t.workshopBoard.sendMugSectionResultWarnings(
                            phase.result.sheetsFailed +
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
              {t.workshopBoard.sendMugSectionCancel}
            </Button>
          )}
          {!isDone && (
            <Button
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleStart}
              disabled={!canStart}
            >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {t.workshopBoard.sendMugSectionStart}
            </Button>
          )}
          {isDone && (
            <Button
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              onClick={close}
            >
              {t.workshopBoard.sendMugSectionClose}
            </Button>
          )}
        </div>

        {/* Edge: fresh = 0 (shouldn't normally be reachable because the CTA is
         *   disabled, but we handle anyway if the operator opens via keyboard). */}
        {snapshot.freshTiles.length === 0 && !isDone && (
          <p className="mt-3 text-xs text-amber-600">
            {t.workshopBoard.sendMugSectionNeedMore}
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
  tone: "amber" | "gray" | "indigo";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-800 border-amber-100"
      : tone === "indigo"
        ? "bg-indigo-50 text-indigo-800 border-indigo-100"
        : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>{label}</div>
  );
}
