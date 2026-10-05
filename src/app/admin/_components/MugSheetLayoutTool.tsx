"use client";

/**
 * Manual counterpart to the workshop-board mug auto-batcher: drop 1-2 mug
 * designs and download the composed A4 sublimation sheet. Lives on
 * `/admin/workshop-batches` next to the notebook / pen / freepack tools.
 *
 * Compose is entirely client-side; the only server interaction is the
 * best-effort save into the shared 7-day history. Unlike the board flow this
 * tool never touches order statuses — the operator is working from loose
 * files, not from the queue.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Coffee,
  Download,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/notebook/composeNotebookBatchPng";
import {
  MUG_DESIGN_HEIGHT_CM,
  MUG_DESIGN_WIDTH_CM,
  MUG_SHEET_ACCEPT_MIME,
  MUG_SHEET_MAX_FILES,
  MUG_SHEET_MIN_FILES,
  buildMugSheetFileName,
  composeMugSheetPng,
} from "@/lib/mug/composeMugSheetPng";
import { uploadWorkshopBatch } from "@/lib/workshopBatches/uploadClient";

/** Matches `ASPECT_TOLERANCE` in the composer so the UI flags the same tiles. */
const ASPECT_TOLERANCE = 0.02;
const TARGET_ASPECT = MUG_DESIGN_WIDTH_CM / MUG_DESIGN_HEIGHT_CM;

interface DroppedTile {
  /** Stable id so React keys survive reorder / removal. */
  key: string;
  file: File;
  /** Object URL for the thumbnail — revoked on removal. */
  previewUrl: string;
  /** Natural size, decoded at drop time so the aspect hint is synchronous. */
  widthPx: number;
  heightPx: number;
}

let tileKeyCounter = 0;
const nextTileKey = (): string => {
  tileKeyCounter += 1;
  return `mug-sheet-tile-${Date.now()}-${tileKeyCounter}`;
};

/** Decode the natural dimensions off an object URL. */
function readImageSize(
  url: string,
): Promise<{ widthPx: number; heightPx: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
    img.onerror = () => reject(new Error("failed to decode image"));
    img.src = url;
  });
}

async function buildTile(file: File): Promise<DroppedTile> {
  const previewUrl = URL.createObjectURL(file);
  const { widthPx, heightPx } = await readImageSize(previewUrl);
  return { key: nextTileKey(), file, previewUrl, widthPx, heightPx };
}

function releaseTile(tile: DroppedTile): void {
  URL.revokeObjectURL(tile.previewUrl);
}

function hasAspectDrift(tile: DroppedTile): boolean {
  if (tile.heightPx === 0) return false;
  const aspect = tile.widthPx / tile.heightPx;
  return Math.abs(aspect - TARGET_ASPECT) / TARGET_ASPECT > ASPECT_TOLERANCE;
}

interface Props {
  /** Bumped by the parent when the tool successfully persists a new sheet. */
  onSaved?: () => void;
  /** Default `false` (collapsed). The `/admin/workshop-batches` page sets it true. */
  defaultOpen?: boolean;
}

export function MugSheetLayoutTool({ onSaved, defaultOpen = false }: Props = {}) {
  const { t } = useLanguageStore();
  const s = t.workshopBatches.mug;

  const [collapsed, setCollapsed] = useState(!defaultOpen);
  const [tiles, setTiles] = useState<DroppedTile[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  const acceptAttr = MUG_SHEET_ACCEPT_MIME.join(",");
  const canCompose =
    !busy &&
    tiles.length >= MUG_SHEET_MIN_FILES &&
    tiles.length <= MUG_SHEET_MAX_FILES;

  // Revoke every outstanding object URL when the tool unmounts. Read through
  // a ref so the cleanup sees the final list without re-running on each drop.
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  useEffect(() => {
    return () => {
      for (const tile of tilesRef.current) releaseTile(tile);
    };
  }, []);

  const addFiles = useCallback(async (files: readonly File[]) => {
    if (files.length === 0) return;
    setErrorMessage(null);
    let built: DroppedTile[];
    try {
      built = await Promise.all(files.map(buildTile));
    } catch (error) {
      console.error("Mug sheet: failed to decode a dropped file:", error);
      setErrorMessage(s.error);
      return;
    }
    setTiles((prev) => {
      const room = MUG_SHEET_MAX_FILES - prev.length;
      if (room <= 0) {
        for (const tile of built) releaseTile(tile);
        return prev;
      }
      // Anything beyond the sheet capacity is dropped — release its URL.
      for (const tile of built.slice(room)) releaseTile(tile);
      return [...prev, ...built.slice(0, room)];
    });
  }, [s.error]);

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
      const result = await composeMugSheetPng(tiles.map((tile) => tile.file));
      // Loose files carry no order number — fall back to slot positions.
      const fileName = buildMugSheetFileName(tiles.map(() => null));
      // 1. Give the operator the file immediately — history is a bonus, not a gate.
      downloadBlob(result.blob, fileName);
      // 2. Best-effort persist into the shared 7-day history.
      try {
        await uploadWorkshopBatch({
          kind: "mug",
          fileName,
          tileCount: tiles.length,
          blob: result.blob,
        });
        onSaved?.();
      } catch (uploadError) {
        console.error("Mug sheet history upload failed:", uploadError);
        setUploadWarning(t.workshopBatches.historyUploadWarn);
      }
    } catch (error) {
      console.error("Mug sheet compose failed:", error);
      setErrorMessage(s.error);
    } finally {
      setBusy(false);
    }
  }, [canCompose, tiles, onSaved, s.error, t.workshopBatches.historyUploadWarn]);

  return (
    <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/40 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Coffee className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <h2 className="text-sm font-semibold text-amber-900 truncate">
            {s.title}
          </h2>
          {tiles.length > 0 && (
            <span className="rounded-full border border-amber-300 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-amber-800 tabular-nums leading-none">
              {s.fileCount(tiles.length, MUG_SHEET_MAX_FILES)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-amber-200 bg-white/70 px-2 text-[11px] font-medium text-amber-800 hover:bg-white"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              {s.title}
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              {t.workshopBoard.layoutClose}
            </>
          )}
        </button>
      </header>

      {!collapsed && (
        <div className="border-t border-amber-200 px-4 py-3 space-y-3">
          <p className="text-xs text-amber-900/80">{s.subtitle}</p>

          {tiles.length < MUG_SHEET_MAX_FILES && (
            <FileDropzone
              accept={acceptAttr}
              multiple
              onFiles={addFiles}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-amber-300 bg-white/60 px-4 py-6 text-center text-sm text-amber-900 transition-colors hover:bg-white",
                "cursor-pointer",
              )}
              dragActiveClassName="border-amber-500 bg-amber-100"
              ariaLabel={s.dropHint}
            >
              {(dragActive) => (
                <>
                  <Download
                    className={cn(
                      "h-5 w-5 shrink-0",
                      dragActive ? "text-amber-700" : "text-amber-500",
                    )}
                    aria-hidden
                  />
                  <span className="font-medium">
                    {dragActive ? s.dropHintActive : s.dropHint}
                  </span>
                  <span className="text-[11px] text-amber-800/70">
                    {s.limits(MUG_SHEET_MIN_FILES, MUG_SHEET_MAX_FILES)}
                    {tiles.length > 0 &&
                      ` · ${s.fileCount(tiles.length, MUG_SHEET_MAX_FILES)}`}
                  </span>
                </>
              )}
            </FileDropzone>
          )}

          {tiles.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {tiles.map((tile, index) => {
                const drifted = hasAspectDrift(tile);
                return (
                  <li
                    key={tile.key}
                    className="relative flex items-stretch gap-2 rounded-lg border border-amber-200 bg-white p-2 shadow-sm"
                  >
                    <span className="absolute left-1 top-1 rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow">
                      {index + 1}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tile.previewUrl}
                      alt={tile.file.name}
                      className="h-16 w-24 shrink-0 rounded border border-gray-200 object-contain bg-gray-50"
                    />
                    <div className="flex min-w-0 flex-1 flex-col justify-between text-[11px]">
                      <div className="min-w-0">
                        <p
                          className="truncate font-semibold text-gray-900"
                          title={tile.file.name}
                        >
                          {tile.file.name}
                        </p>
                        <p className="mt-0.5 text-[10px] tabular-nums text-gray-500">
                          {tile.widthPx} × {tile.heightPx} px
                        </p>
                        {drifted && (
                          <p className="mt-0.5 inline-flex items-start gap-1 text-[10px] font-medium text-amber-800">
                            <AlertTriangle
                              className="mt-0.5 h-3 w-3 shrink-0"
                              aria-hidden
                            />
                            {s.aspectWarn(tile.widthPx, tile.heightPx)}
                          </p>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveTile(tile.key, -1)}
                          disabled={index === 0 || busy}
                          aria-label={s.moveLeft}
                          title={s.moveLeft}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowLeft className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTile(tile.key, 1)}
                          disabled={index === tiles.length - 1 || busy}
                          aria-label={s.moveRight}
                          title={s.moveRight}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowRight className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTile(tile.key)}
                          disabled={busy}
                          aria-label={s.remove}
                          title={s.remove}
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

          <p className="text-[11px] text-amber-900/70">{s.orderExplain}</p>

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
            <span className="text-[11px] font-medium text-amber-900/80 tabular-nums">
              {s.geometrySummary}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {tiles.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  disabled={busy}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {s.clear}
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
                    {s.busy}
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {s.cta}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
