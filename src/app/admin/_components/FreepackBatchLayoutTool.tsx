"use client";

/**
 * Workshop free-pack tool: drops arbitrarily-sized PNG/JPG tiles onto one
 * zero-gap row-by-row sheet, capped at 60 cm per row. Mounted on
 * `/admin/workshop-batches` as the third tab.
 *
 * Unlike the notebook tool it has NO parsing of order numbers / colors from
 * file names — it's intentionally generic so new product sizes work out of
 * the box. The only semantics it cares about are:
 *   • tile count (2..FREEPACK_MAX_FILES)
 *   • each tile's natural (width, height) in pixels
 *   • first-file DPI (for the output pHYs chunk; soft warning if ≠ 300)
 *
 * All failures (compose, upload) are surfaced as banners; the download
 * itself is always best-effort — the operator gets the file even if the
 * history record couldn't be persisted (parallels the notebook tool).
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Package,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { DEFAULT_DPI, cmToPx, pxToCm } from "@/lib/printDimensions";
import {
  buildFreepackFileName,
  composeFreepackPng,
  computeFreepackLayout,
  FREEPACK_ACCEPT_MIME,
  FREEPACK_MAX_FILES,
  FREEPACK_MAX_WIDTH_CM,
  FREEPACK_MIN_FILES,
  freepackTilesAllSameSize,
  freepackUniqueSizeCount,
  type FreepackTileSize,
} from "@/lib/workshopBatches/composeFreepackPng";
import { downloadBlob } from "@/lib/notebook/composeNotebookBatchPng";
import { uploadWorkshopBatch } from "@/lib/workshopBatches/uploadClient";
import { readSourceDpiFromFile } from "@/lib/notebook/pngPhysChunk";

interface DroppedTile {
  /** Stable id so React keys survive reorder / removal. */
  key: string;
  file: File;
  /** Object URL for the thumbnail — revoked on removal. */
  previewUrl: string;
}

/** Decoded dimensions (populated lazily by {@link DecodeEffect} below). */
interface DecodedTile {
  key: string;
  widthPx: number;
  heightPx: number;
}

let tileKeyCounter = 0;
const nextTileKey = (): string => {
  tileKeyCounter += 1;
  return `fp-tile-${Date.now()}-${tileKeyCounter}`;
};

function buildTile(file: File): DroppedTile {
  return {
    key: nextTileKey(),
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

function releaseTile(tile: DroppedTile): void {
  URL.revokeObjectURL(tile.previewUrl);
}

interface Props {
  /** Bumped by the parent after a successful compose+upload. */
  onSaved?: () => void;
  /** Default `false` (collapsed). The standalone page sets it true. */
  defaultOpen?: boolean;
}

export function FreepackBatchLayoutTool({
  onSaved,
  defaultOpen = false,
}: Props = {}) {
  const { t } = useLanguageStore();
  const s = t.workshopBatches.freepack;

  const [collapsed, setCollapsed] = useState(!defaultOpen);
  const [tiles, setTiles] = useState<DroppedTile[]>([]);
  const [decoded, setDecoded] = useState<DecodedTile[]>([]);
  const [sourceDpi, setSourceDpi] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  const acceptAttr = FREEPACK_ACCEPT_MIME.join(",");

  // ─── Add / remove / reorder ───────────────────────────────────────────────

  const addFiles = useCallback((files: readonly File[]) => {
    if (files.length === 0) return;
    setErrorMessage(null);
    setTiles((prev) => {
      const room = FREEPACK_MAX_FILES - prev.length;
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
    setUploadWarning(null);
    setTiles((prev) => {
      for (const tile of prev) releaseTile(tile);
      return [];
    });
    setDecoded([]);
    setSourceDpi(null);
  }, []);

  // ─── Decode dimensions off the object URLs for preview + warnings ────────

  useEffect(() => {
    let cancelled = false;
    if (tiles.length === 0) {
      setDecoded([]);
      return () => {
        cancelled = true;
      };
    }
    Promise.all(
      tiles.map(
        (tile) =>
          new Promise<DecodedTile>((resolve, reject) => {
            const img = new Image();
            img.onload = () =>
              resolve({
                key: tile.key,
                widthPx: img.naturalWidth,
                heightPx: img.naturalHeight,
              });
            img.onerror = () => reject(new Error("decode failed"));
            img.src = tile.previewUrl;
          }),
      ),
    )
      .then((rows) => {
        if (cancelled) return;
        setDecoded(rows);
      })
      .catch(() => {
        // Keep previous `decoded` on partial failure — the UI falls back to
        // "no size info" and the compose step will raise a proper error.
      });
    return () => {
      cancelled = true;
    };
  }, [tiles]);

  // Read source DPI from the first file whenever the first tile changes.
  useEffect(() => {
    const first = tiles[0];
    if (!first) {
      setSourceDpi(null);
      return;
    }
    let cancelled = false;
    void readSourceDpiFromFile(first.file).then((dpi) => {
      if (cancelled) return;
      setSourceDpi(dpi ?? DEFAULT_DPI);
    });
    return () => {
      cancelled = true;
    };
  }, [tiles]);

  // ─── Derived state (overflow error, DPI warning, mixed-sizes warning) ────

  const effectiveDpi = sourceDpi ?? DEFAULT_DPI;
  const maxWidthPx = cmToPx(FREEPACK_MAX_WIDTH_CM, effectiveDpi);

  // decoded is keyed per tile, align it with the (possibly reordered) tiles
  // list by looking up by key.
  const sizesInOrder: FreepackTileSize[] = tiles
    .map((tile) => decoded.find((d) => d.key === tile.key))
    .filter((d): d is DecodedTile => d !== undefined)
    .map((d) => ({ widthPx: d.widthPx, heightPx: d.heightPx }));

  const allDecoded = sizesInOrder.length === tiles.length && tiles.length > 0;

  const tooWideTile = allDecoded
    ? sizesInOrder.find((s0) => s0.widthPx > maxWidthPx)
    : undefined;

  const dpiOffSpec =
    sourceDpi !== null && sourceDpi !== 300 && tiles.length > 0;

  const mixedSizes =
    allDecoded && !freepackTilesAllSameSize(sizesInOrder);
  const uniqueSizeCount = allDecoded
    ? freepackUniqueSizeCount(sizesInOrder)
    : 0;

  // Compute projected canvas size when all tiles are decoded and the layout
  // is valid (no overflow). Used by the PreviewFooter.
  const projected: { widthPx: number; heightPx: number } | null = (() => {
    if (!allDecoded || tooWideTile) return null;
    if (
      sizesInOrder.length < FREEPACK_MIN_FILES ||
      sizesInOrder.length > FREEPACK_MAX_FILES
    ) {
      return null;
    }
    try {
      const layout = computeFreepackLayout({
        sizes: sizesInOrder,
        maxWidthPx,
      });
      return {
        widthPx: layout.canvasWidthPx,
        heightPx: layout.canvasHeightPx,
      };
    } catch {
      return null;
    }
  })();

  const canCompose =
    !busy &&
    tiles.length >= FREEPACK_MIN_FILES &&
    tiles.length <= FREEPACK_MAX_FILES &&
    !tooWideTile;

  // ─── Compose ──────────────────────────────────────────────────────────────

  const handleCompose = useCallback(async () => {
    if (!canCompose) return;
    setBusy(true);
    setErrorMessage(null);
    setUploadWarning(null);
    try {
      const files = tiles.map((tile) => tile.file);
      const result = await composeFreepackPng(files);
      const fileName = buildFreepackFileName(tiles.length);
      // Hand the file to the operator immediately.
      downloadBlob(result.blob, fileName);
      // Best-effort history upload.
      try {
        await uploadWorkshopBatch({
          kind: "freepack",
          fileName,
          tileCount: tiles.length,
          blob: result.blob,
        });
        onSaved?.();
      } catch (uploadError) {
        console.error("Freepack history upload failed:", uploadError);
        setUploadWarning(t.workshopBatches.historyUploadWarn);
      }
    } catch (error) {
      console.error("Freepack compose failed:", error);
      setErrorMessage(s.error);
    } finally {
      setBusy(false);
    }
  }, [canCompose, tiles, onSaved, s.error, t.workshopBatches.historyUploadWarn]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50/40 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Package className="h-4 w-4 shrink-0 text-indigo-700" aria-hidden />
          <h2 className="text-sm font-semibold text-indigo-900 truncate">
            {s.title}
          </h2>
          {tiles.length > 0 && (
            <span className="rounded-full border border-indigo-300 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 tabular-nums leading-none">
              {s.fileCount(tiles.length, FREEPACK_MAX_FILES)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-indigo-200 bg-white/70 px-2 text-[11px] font-medium text-indigo-800 hover:bg-white"
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
        <div className="border-t border-indigo-200 px-4 py-3 space-y-3">
          <p className="text-xs text-indigo-900/80">{s.subtitle}</p>

          {tiles.length < FREEPACK_MAX_FILES && (
            <FileDropzone
              accept={acceptAttr}
              multiple
              onFiles={addFiles}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-indigo-300 bg-white/60 px-4 py-6 text-center text-sm text-indigo-900 transition-colors hover:bg-white",
                "cursor-pointer",
              )}
              dragActiveClassName="border-indigo-500 bg-indigo-100"
              ariaLabel={s.dropHint}
            >
              {(dragActive) => (
                <>
                  <Download
                    className={cn(
                      "h-5 w-5 shrink-0",
                      dragActive ? "text-indigo-700" : "text-indigo-500",
                    )}
                    aria-hidden
                  />
                  <span className="font-medium">
                    {dragActive ? s.dropHintActive : s.dropHint}
                  </span>
                  <span className="text-[11px] text-indigo-800/70">
                    {s.limits(FREEPACK_MIN_FILES, FREEPACK_MAX_FILES)}
                    {tiles.length > 0 &&
                      ` · ${s.fileCount(tiles.length, FREEPACK_MAX_FILES)}`}
                  </span>
                </>
              )}
            </FileDropzone>
          )}

          {tiles.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {tiles.map((tile, index) => {
                const dim = decoded.find((d) => d.key === tile.key);
                const dimLabel = dim
                  ? `${dim.widthPx} × ${dim.heightPx} px`
                  : "…";
                return (
                  <li
                    key={tile.key}
                    className="relative flex items-stretch gap-2 rounded-lg border border-indigo-200 bg-white p-2 shadow-sm"
                  >
                    <span className="absolute left-1 top-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow">
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
                        <p
                          className="truncate font-semibold text-gray-900"
                          title={tile.file.name}
                        >
                          {tile.file.name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-500 tabular-nums">
                          {dimLabel}
                        </p>
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

          <p className="text-[11px] text-indigo-900/70">{s.orderExplain}</p>

          {/* Blocking: a tile wider than 60 cm. */}
          {tooWideTile && (
            <p className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              {s.tileTooWide(
                tooWideTile.widthPx,
                maxWidthPx,
                FREEPACK_MAX_WIDTH_CM,
              )}
            </p>
          )}

          {/* Soft: non-300 DPI source. */}
          {dpiOffSpec && projected && (
            <p className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              {s.dpiWarn(projected.widthPx, projected.heightPx, effectiveDpi)}
            </p>
          )}

          {/* Soft: mixed sizes. */}
          {mixedSizes && uniqueSizeCount > 1 && (
            <p className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              {s.mixedSizesWarn(uniqueSizeCount)}
            </p>
          )}

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
            {projected ? (
              <span className="text-[11px] font-medium text-indigo-900/80 tabular-nums">
                {s.outputSize(
                  projected.widthPx,
                  projected.heightPx,
                  pxToCm(projected.widthPx, effectiveDpi),
                  pxToCm(projected.heightPx, effectiveDpi),
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

          <p className="text-[10px] text-indigo-900/50">
            {s.limits(FREEPACK_MIN_FILES, FREEPACK_MAX_FILES)}
          </p>
        </div>
      )}
    </section>
  );
}
