"use client";

/**
 * Independent workshop-board tool for pen artwork: drop 2-12 PNGs sized
 * 591x71 (5 cm x 0.6 cm at 300 DPI) and download a single side-by-side PNG
 * that mirrors the physical UV-flatbed jig geometry — 3 columns per row
 * with 13.4 cm horizontal / 2.910 cm vertical gaps. Sibling to
 * {@link NotebookBatchLayoutTool}.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Pencil,
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
import { pxToCm } from "@/lib/printDimensions";
import {
  parseNotebookColorFromFileName,
  type ParsedNotebookFileName,
} from "@/lib/notebook/parseNotebookColorFromFileName";
import {
  buildPenBatchFileName,
  composePenBatchPng,
  computePenBatchGrid,
  PEN_BATCH_ACCEPT_MIME,
  PEN_BATCH_DPI,
  PEN_BATCH_MAX_FILES,
  PEN_BATCH_MIN_FILES,
  PEN_SLOT_HEIGHT_PX,
  PEN_SLOT_WIDTH_PX,
} from "@/lib/pen/composePenBatchPng";
import { downloadBlob } from "@/lib/notebook/composeNotebookBatchPng";

interface DroppedTile {
  key: string;
  file: File;
  parsed: ParsedNotebookFileName;
  previewUrl: string;
  /** Filled in asynchronously once the browser decodes the image. */
  actualWidthPx: number | null;
  actualHeightPx: number | null;
}

let tileKeyCounter = 0;
const nextTileKey = (): string => {
  tileKeyCounter += 1;
  return `pen-batch-tile-${Date.now()}-${tileKeyCounter}`;
};

function buildTile(file: File): DroppedTile {
  return {
    key: nextTileKey(),
    file,
    parsed: parseNotebookColorFromFileName(file.name),
    previewUrl: URL.createObjectURL(file),
    actualWidthPx: null,
    actualHeightPx: null,
  };
}

function releaseTile(tile: DroppedTile): void {
  URL.revokeObjectURL(tile.previewUrl);
}

function tileLabel(tile: DroppedTile, indexFallback: number): string {
  const { orderNumber, color } = tile.parsed;
  const colorPart = color.slug === "unknown" ? `#${indexFallback}` : color.label.ro;
  if (orderNumber !== null) return `${orderNumber} · ${colorPart}`;
  return colorPart;
}

/** Match the tolerance used inside {@link composePenBatchPng}. */
const SIZE_TOLERANCE_PX = 4;

function isWrongSize(tile: DroppedTile): boolean {
  if (tile.actualWidthPx === null || tile.actualHeightPx === null) return false;
  return (
    Math.abs(tile.actualWidthPx - PEN_SLOT_WIDTH_PX) > SIZE_TOLERANCE_PX ||
    Math.abs(tile.actualHeightPx - PEN_SLOT_HEIGHT_PX) > SIZE_TOLERANCE_PX
  );
}

export function PenBatchLayoutTool() {
  const { t } = useLanguageStore();
  const s = t.workshopBoard;

  const [collapsed, setCollapsed] = useState(true);
  const [tiles, setTiles] = useState<DroppedTile[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const acceptAttr = PEN_BATCH_ACCEPT_MIME.join(",");

  const canCompose =
    !busy &&
    tiles.length >= PEN_BATCH_MIN_FILES &&
    tiles.length <= PEN_BATCH_MAX_FILES;

  const addFiles = useCallback((files: readonly File[]) => {
    if (files.length === 0) return;
    setErrorMessage(null);
    setTiles((prev) => {
      const room = PEN_BATCH_MAX_FILES - prev.length;
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

  const setTileSize = useCallback(
    (key: string, w: number, h: number) => {
      setTiles((prev) =>
        prev.map((tile) =>
          tile.key === key
            ? { ...tile, actualWidthPx: w, actualHeightPx: h }
            : tile,
        ),
      );
    },
    [],
  );

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
    try {
      const files = tiles.map((tile) => tile.file);
      const result = await composePenBatchPng(files);
      const parsed = tiles.map((tile) => tile.parsed);
      const fileName = buildPenBatchFileName(parsed);
      downloadBlob(result.blob, fileName);
    } catch (error) {
      console.error("Pen batch compose failed:", error);
      setErrorMessage(s.penBatchError);
    } finally {
      setBusy(false);
    }
  }, [canCompose, tiles, s.penBatchError]);

  // Projected output size from the current tile count — pure math, no async.
  const projected = useMemo(() => {
    if (tiles.length < PEN_BATCH_MIN_FILES) return null;
    const grid = computePenBatchGrid(tiles.length);
    return {
      widthPx: grid.canvasWidthPx,
      heightPx: grid.canvasHeightPx,
      widthCm: pxToCm(grid.canvasWidthPx, PEN_BATCH_DPI),
      heightCm: pxToCm(grid.canvasHeightPx, PEN_BATCH_DPI),
    };
  }, [tiles.length]);

  return (
    <section className="mb-5 rounded-2xl border border-pink-200 bg-pink-50/40 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Pencil className="h-4 w-4 shrink-0 text-pink-700" aria-hidden />
          <h2 className="text-sm font-semibold text-pink-900 truncate">
            {s.penBatchTitle}
          </h2>
          {tiles.length > 0 && (
            <span className="rounded-full border border-pink-300 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-pink-800 tabular-nums leading-none">
              {s.penBatchFileCount(tiles.length, PEN_BATCH_MAX_FILES)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-pink-200 bg-white/70 px-2 text-[11px] font-medium text-pink-800 hover:bg-white"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              {s.assembleLayoutCta}
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
        <div className="border-t border-pink-200 px-4 py-3 space-y-3">
          <p className="text-xs text-pink-900/80">{s.penBatchSubtitle}</p>

          {tiles.length < PEN_BATCH_MAX_FILES && (
            <FileDropzone
              accept={acceptAttr}
              multiple
              onFiles={addFiles}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-pink-300 bg-white/60 px-4 py-6 text-center text-sm text-pink-900 transition-colors hover:bg-white",
                "cursor-pointer",
              )}
              dragActiveClassName="border-pink-500 bg-pink-100"
              ariaLabel={s.penBatchDropHint}
            >
              {(dragActive) => (
                <>
                  <Download
                    className={cn(
                      "h-5 w-5 shrink-0",
                      dragActive ? "text-pink-700" : "text-pink-500",
                    )}
                    aria-hidden
                  />
                  <span className="font-medium">
                    {dragActive ? s.penBatchDropHintActive : s.penBatchDropHint}
                  </span>
                  <span className="text-[11px] text-pink-800/70">
                    {s.penBatchLimits(PEN_BATCH_MIN_FILES, PEN_BATCH_MAX_FILES)}
                    {tiles.length > 0 && ` · ${s.penBatchFileCount(tiles.length, PEN_BATCH_MAX_FILES)}`}
                  </span>
                </>
              )}
            </FileDropzone>
          )}

          {tiles.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tiles.map((tile, index) => {
                const label = tileLabel(tile, index + 1);
                const isUnknown = tile.parsed.color.slug === "unknown";
                const wrongSize = isWrongSize(tile);
                return (
                  <li
                    key={tile.key}
                    className={cn(
                      "relative flex items-stretch gap-2 rounded-lg border bg-white p-2 shadow-sm",
                      wrongSize ? "border-amber-300" : "border-pink-200",
                    )}
                  >
                    <span className="absolute left-1 top-1 rounded-full bg-pink-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow">
                      {index + 1}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tile.previewUrl}
                      alt={tile.file.name}
                      onLoad={(event) => {
                        const img = event.currentTarget;
                        setTileSize(tile.key, img.naturalWidth, img.naturalHeight);
                      }}
                      className="h-16 w-24 shrink-0 rounded border border-gray-200 object-contain bg-gray-50"
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
                            {s.penBatchColorUnknown}
                          </p>
                        )}
                        {wrongSize &&
                          tile.actualWidthPx !== null &&
                          tile.actualHeightPx !== null && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-800">
                              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                              {s.penBatchWrongSize(
                                tile.actualWidthPx,
                                tile.actualHeightPx,
                              )}
                            </p>
                          )}
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveTile(tile.key, -1)}
                          disabled={index === 0 || busy}
                          aria-label={s.penBatchMoveLeft}
                          title={s.penBatchMoveLeft}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowLeft className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTile(tile.key, 1)}
                          disabled={index === tiles.length - 1 || busy}
                          aria-label={s.penBatchMoveRight}
                          title={s.penBatchMoveRight}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowRight className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTile(tile.key)}
                          disabled={busy}
                          aria-label={s.penBatchRemove}
                          title={s.penBatchRemove}
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

          <p className="text-[11px] text-pink-900/70">{s.penBatchOrderExplain}</p>

          {errorMessage && (
            <p className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              {errorMessage}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {projected ? (
              <span className="text-[11px] font-medium text-pink-900/80 tabular-nums">
                {s.penBatchOutputSize(
                  projected.widthPx,
                  projected.heightPx,
                  projected.widthCm,
                  projected.heightCm,
                )}
              </span>
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
                  {s.penBatchClear}
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
                    {s.penBatchBusy}
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {s.penBatchCta}
                  </>
                )}
              </Button>
            </div>
          </div>

          <p className="text-[10px] text-pink-900/50">
            {s.penBatchLimits(PEN_BATCH_MIN_FILES, PEN_BATCH_MAX_FILES)}
          </p>
        </div>
      )}
    </section>
  );
}
