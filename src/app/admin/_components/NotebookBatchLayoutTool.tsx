"use client";

/**
 * Independent workshop-board tool: drop 2–4 notebook cover PNG/JPGs and
 * download a single side-by-side PNG for the UV flatbed. See the plan in
 * `.cursor/plans/notebook_batch_layout_tool_881171fa.plan.md`.
 *
 * Everything is client-side — the tool never touches the database or R2.
 * That keeps it "independent" (the user's exact word) and avoids new API
 * surface for a purely mechanical file-composition workflow.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Layers,
  Loader2,
  Trash2,
  X,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { pxToCm, DEFAULT_DPI, cmToPx } from "@/lib/printDimensions";
import {
  buildNotebookBatchFileName,
  parseNotebookColorFromFileName,
  type ParsedNotebookFileName,
} from "@/lib/notebook/parseNotebookColorFromFileName";
import {
  composeNotebookBatchPng,
  computeNotebookBatchGrid,
  downloadBlob,
  NOTEBOOK_BATCH_ACCEPT_MIME,
  NOTEBOOK_BATCH_MAX_FILES,
  NOTEBOOK_BATCH_MIN_FILES,
  NOTEBOOK_GAP_CM,
} from "@/lib/notebook/composeNotebookBatchPng";
import { uploadWorkshopBatch } from "@/lib/workshopBatches/uploadClient";

interface DroppedTile {
  /** Stable id so React keys survive reorder / removal. */
  key: string;
  file: File;
  parsed: ParsedNotebookFileName;
  /** Object URL for the thumbnail — revoked on removal. */
  previewUrl: string;
}

let tileKeyCounter = 0;
const nextTileKey = (): string => {
  tileKeyCounter += 1;
  return `nb-batch-tile-${Date.now()}-${tileKeyCounter}`;
};

function buildTile(file: File): DroppedTile {
  return {
    key: nextTileKey(),
    file,
    parsed: parseNotebookColorFromFileName(file.name),
    previewUrl: URL.createObjectURL(file),
  };
}

function releaseTile(tile: DroppedTile): void {
  URL.revokeObjectURL(tile.previewUrl);
}

/** Slot label used in previews (the same building block as the output name). */
function tileLabel(tile: DroppedTile, indexFallback: number): string {
  const { orderNumber, color } = tile.parsed;
  const colorPart = color.slug === "unknown" ? `#${indexFallback}` : color.label.ro;
  if (orderNumber !== null) return `${orderNumber} · ${colorPart}`;
  return colorPart;
}

interface Props {
  /** Bumped by the parent when the tool successfully persists a new batch. */
  onSaved?: () => void;
  /** Default `false` (collapsed). The standalone `/admin/workshop-batches` page sets it true. */
  defaultOpen?: boolean;
}

export function NotebookBatchLayoutTool({ onSaved, defaultOpen = false }: Props = {}) {
  const { t } = useLanguageStore();
  const s = t.workshopBoard;
  const sBatches = t.workshopBatches;

  const [collapsed, setCollapsed] = useState(!defaultOpen);
  const [tiles, setTiles] = useState<DroppedTile[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  const acceptAttr = NOTEBOOK_BATCH_ACCEPT_MIME.join(",");

  const remainingSlots = NOTEBOOK_BATCH_MAX_FILES - tiles.length;
  const canCompose =
    !busy &&
    tiles.length >= NOTEBOOK_BATCH_MIN_FILES &&
    tiles.length <= NOTEBOOK_BATCH_MAX_FILES;

  const addFiles = useCallback((files: readonly File[]) => {
    if (files.length === 0) return;
    setErrorMessage(null);
    setTiles((prev) => {
      const room = NOTEBOOK_BATCH_MAX_FILES - prev.length;
      if (room <= 0) return prev;
      const next = files.slice(0, room).map(buildTile);
      return [...prev, ...next];
    });
  }, []);

  const removeTile = useCallback((key: string) => {
    setErrorMessage(null);
    setTiles((prev) => {
      const removed = prev.find((tile) => tile.key === key);
      if (removed) releaseTile(removed);
      return prev.filter((tile) => tile.key !== key);
    });
  }, []);

  const moveTile = useCallback((key: string, direction: -1 | 1) => {
    setErrorMessage(null);
    setTiles((prev) => {
      const index = prev.findIndex((tile) => tile.key === key);
      if (index < 0) return prev;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved!);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setErrorMessage(null);
    setTiles((prev) => {
      for (const tile of prev) releaseTile(tile);
      return [];
    });
  }, []);

  const handleCompose = useCallback(async () => {
    if (!canCompose) return;
    setBusy(true);
    setErrorMessage(null);
    setUploadWarning(null);
    try {
      const files = tiles.map((tile) => tile.file);
      const result = await composeNotebookBatchPng(files);
      const parsed = tiles.map((tile) => tile.parsed);
      const fileName = buildNotebookBatchFileName(parsed);
      // 1. Give the operator the file immediately — history is a bonus, not a gate.
      downloadBlob(result.blob, fileName);
      // 2. Best-effort persist into the shared 7-day history.
      try {
        await uploadWorkshopBatch({
          kind: "notebook",
          fileName,
          tileCount: tiles.length,
          blob: result.blob,
        });
        onSaved?.();
      } catch (uploadError) {
        console.error("Notebook batch history upload failed:", uploadError);
        setUploadWarning(sBatches.historyUploadWarn);
      }
    } catch (error) {
      console.error("Notebook batch compose failed:", error);
      setErrorMessage(s.nbBatchError);
    } finally {
      setBusy(false);
    }
  }, [canCompose, tiles, s.nbBatchError, sBatches.historyUploadWarn, onSaved]);

  return (
    <section className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          <h2 className="text-sm font-semibold text-emerald-900 truncate">
            {s.nbBatchTitle}
          </h2>
          {tiles.length > 0 && (
            <span className="rounded-full border border-emerald-300 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 tabular-nums leading-none">
              {s.nbBatchFileCount(tiles.length, NOTEBOOK_BATCH_MAX_FILES)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-200 bg-white/70 px-2 text-[11px] font-medium text-emerald-800 hover:bg-white"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              {t.workshopBoard.assembleLayoutCta}
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              {s.layoutClose}
            </>
          )}
        </button>
      </header>

      {!collapsed && (
        <div className="border-t border-emerald-200 px-4 py-3 space-y-3">
          <p className="text-xs text-emerald-900/80">{s.nbBatchSubtitle}</p>

          {tiles.length < NOTEBOOK_BATCH_MAX_FILES && (
            <FileDropzone
              accept={acceptAttr}
              multiple
              onFiles={addFiles}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-emerald-300 bg-white/60 px-4 py-6 text-center text-sm text-emerald-900 transition-colors hover:bg-white",
                "cursor-pointer",
              )}
              dragActiveClassName="border-emerald-500 bg-emerald-100"
              ariaLabel={s.nbBatchDropHint}
            >
              {(dragActive) => (
                <>
                  <Download
                    className={cn(
                      "h-5 w-5 shrink-0",
                      dragActive ? "text-emerald-700" : "text-emerald-500",
                    )}
                    aria-hidden
                  />
                  <span className="font-medium">
                    {dragActive ? s.nbBatchDropHintActive : s.nbBatchDropHint}
                  </span>
                  <span className="text-[11px] text-emerald-800/70">
                    {s.nbBatchLimits(NOTEBOOK_BATCH_MIN_FILES, NOTEBOOK_BATCH_MAX_FILES)}
                    {tiles.length > 0 && ` · ${s.nbBatchFileCount(tiles.length, NOTEBOOK_BATCH_MAX_FILES)}`}
                  </span>
                </>
              )}
            </FileDropzone>
          )}

          {tiles.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {tiles.map((tile, index) => {
                const label = tileLabel(tile, index + 1);
                const isUnknown = tile.parsed.color.slug === "unknown";
                return (
                  <li
                    key={tile.key}
                    className="relative flex items-stretch gap-2 rounded-lg border border-emerald-200 bg-white p-2 shadow-sm"
                  >
                    <span className="absolute left-1 top-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow">
                      {index + 1}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tile.previewUrl}
                      alt={tile.file.name}
                      className="h-16 w-16 shrink-0 rounded border border-gray-200 object-contain bg-gray-50"
                    />
                    <div className="flex min-w-0 flex-1 flex-col justify-between text-[11px]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-300"
                            style={{ backgroundColor: tile.parsed.color.hex }}
                            title={tile.parsed.color.label.ro}
                          />
                          <span
                            className={cn(
                              "truncate font-semibold",
                              isUnknown ? "text-amber-800" : "text-gray-900",
                            )}
                            title={label}
                          >
                            {label}
                          </span>
                        </div>
                        <p
                          className="mt-0.5 truncate text-[10px] text-gray-500"
                          title={tile.file.name}
                        >
                          {tile.file.name}
                        </p>
                        {isUnknown && (
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-800">
                            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                            {s.nbBatchColorUnknown}
                          </p>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveTile(tile.key, -1)}
                          disabled={index === 0 || busy}
                          aria-label={s.nbBatchMoveLeft}
                          title={s.nbBatchMoveLeft}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowLeft className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTile(tile.key, 1)}
                          disabled={index === tiles.length - 1 || busy}
                          aria-label={s.nbBatchMoveRight}
                          title={s.nbBatchMoveRight}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowRight className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTile(tile.key)}
                          disabled={busy}
                          aria-label={s.nbBatchRemove}
                          title={s.nbBatchRemove}
                          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-red-500 hover:bg-red-50 disabled:opacity-40"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[11px] text-emerald-900/70">{s.nbBatchOrderExplain}</p>

          {errorMessage && (
            <p className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              {errorMessage}
            </p>
          )}

          {uploadWarning && (
            <p className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              {uploadWarning}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {tiles.length > 0 ? (
              <PreviewFooter tiles={tiles} unlabeled={s.nbBatchOutputSize} />
            ) : (
              <span aria-hidden />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {tiles.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  disabled={busy}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {s.nbBatchClear}
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleCompose}
                disabled={!canCompose}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {s.nbBatchBusy}
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {s.nbBatchCta}
                  </>
                )}
              </Button>
            </div>
          </div>

          <p className="text-[10px] text-emerald-900/50">
            {remainingSlots > 0
              ? s.nbBatchLimits(NOTEBOOK_BATCH_MIN_FILES, NOTEBOOK_BATCH_MAX_FILES)
              : s.nbBatchFileCount(tiles.length, NOTEBOOK_BATCH_MAX_FILES)}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Show the projected output pixel + physical size once we can read the tile
 * dimensions from the object URLs. Decoded lazily so we don't stall the main
 * thread with every drop.
 *
 * The projected size is computed via {@link computeNotebookBatchGrid} so it
 * matches what the actual composer will emit: `slotW = max(width)`,
 * `slotH = max(height)`, then grid math applies the 1 cm gaps.
 */
function PreviewFooter({
  tiles,
  unlabeled,
}: {
  /** Parent guarantees `tiles.length > 0` so we never need a null reset. */
  tiles: readonly DroppedTile[];
  unlabeled: (widthPx: number, heightPx: number, widthCm: number, heightCm: number) => string;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Decode dimensions off the object URLs. The parent guards against
  // `tiles.length === 0`, so we always have work to do here.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      tiles.map(
        (tile) =>
          new Promise<{ w: number; h: number }>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => reject(new Error("failed"));
            img.src = tile.previewUrl;
          }),
      ),
    )
      .then((dims) => {
        if (cancelled) return;
        const slotW = dims.reduce((max, d) => Math.max(max, d.w), 0);
        const slotH = dims.reduce((max, d) => Math.max(max, d.h), 0);
        if (slotW === 0 || slotH === 0) return;
        // Preview uses the default 300 DPI for the 1 cm gap. If a source
        // file is 150 DPI the compose step recomputes at that DPI and the
        // resulting canvas will be smaller than shown here — acceptable
        // for a preview footer (worst-case off by a few px).
        const gapPx = cmToPx(NOTEBOOK_GAP_CM, DEFAULT_DPI);
        const grid = computeNotebookBatchGrid({
          count: dims.length,
          slotWidthPx: slotW,
          slotHeightPx: slotH,
          gapHPx: gapPx,
          gapVPx: gapPx,
        });
        setSize({ w: grid.canvasWidthPx, h: grid.canvasHeightPx });
      })
      .catch(() => {
        // Leave the last successful preview visible; a decoding failure
        // shouldn't clear the size indicator.
      });
    return () => {
      cancelled = true;
    };
    // Recompute whenever the tile list changes (add / remove / reorder).
  }, [tiles]);

  if (!size) return <span aria-hidden />;
  const widthCm = pxToCm(size.w, DEFAULT_DPI);
  const heightCm = pxToCm(size.h, DEFAULT_DPI);
  return (
    <span className="text-[11px] font-medium text-emerald-900/80 tabular-nums">
      {unlabeled(size.w, size.h, widthCm, heightCm)}
    </span>
  );
}
