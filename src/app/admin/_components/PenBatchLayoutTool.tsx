"use client";

/**
 * Independent workshop-board tool for pen artwork: drop 2-12 PNGs sized
 * 591x71 (5 cm x 0.6 cm at 300 DPI) and download a single side-by-side PNG
 * that mirrors the physical UV-flatbed jig geometry — 3 columns per row
 * with 13.4 cm horizontal / 2.910 cm vertical gaps. Sibling to
 * {@link NotebookBatchLayoutTool}.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
  PEN_BATCH_MAX_FILES,
  PEN_BATCH_MIN_FILES,
  type PenBatchGeometry,
} from "@/lib/pen/composePenBatchPng";
import {
  PEN_PRESETS,
  PEN_PRESET_LONG,
  PEN_PRESET_STANDARD,
  clampGeometryCm,
  geometryCmEquals,
  geometryFromCm,
  type PenBatchGeometryCm,
  type PenBatchPresetId,
} from "@/lib/pen/penBatchPresets";
import { downloadBlob } from "@/lib/notebook/composeNotebookBatchPng";
import { readSourceDpiFromFile } from "@/lib/notebook/pngPhysChunk";
import { uploadWorkshopBatch } from "@/lib/workshopBatches/uploadClient";

interface DroppedTile {
  key: string;
  file: File;
  parsed: ParsedNotebookFileName;
  previewUrl: string;
  /** Filled in asynchronously once the browser decodes the image. */
  actualWidthPx: number | null;
  actualHeightPx: number | null;
  /**
   * DPI read from the PNG `pHYs` chunk. `null` = not decoded yet or the
   * source is a JPEG / PNG without `pHYs` (we can't tell what DPI it was
   * authored at). Treated as off-spec in {@link isOffSpec}.
   */
  actualDpi: number | null;
  /** True once the async pHYs probe has finished (success or miss). */
  dpiProbed: boolean;
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
    actualDpi: null,
    dpiProbed: false,
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
/** DPI slack — printer software rounds pHYs values, so 298–302 all read as 300. */
const DPI_TOLERANCE = 2;

function hasWrongPixelSize(
  tile: DroppedTile,
  geometry: PenBatchGeometry,
): boolean {
  if (tile.actualWidthPx === null || tile.actualHeightPx === null) return false;
  return (
    Math.abs(tile.actualWidthPx - geometry.slotWidthPx) > SIZE_TOLERANCE_PX ||
    Math.abs(tile.actualHeightPx - geometry.slotHeightPx) > SIZE_TOLERANCE_PX
  );
}

function hasWrongDpi(tile: DroppedTile, geometry: PenBatchGeometry): boolean {
  // Only flag once the probe finished — before that, treat DPI as
  // provisionally OK so we don't briefly show a red banner on every drop.
  if (!tile.dpiProbed) return false;
  if (tile.actualDpi === null) return true;
  return Math.abs(tile.actualDpi - geometry.dpi) > DPI_TOLERANCE;
}

function isOffSpec(tile: DroppedTile, geometry: PenBatchGeometry): boolean {
  return hasWrongPixelSize(tile, geometry) || hasWrongDpi(tile, geometry);
}

// ─── Geometry persistence ────────────────────────────────────────────────────

const LS_GEOMETRY_KEY = "pen-batch-geometry-v1";

interface PersistedGeometry {
  preset: PenBatchPresetId;
  custom: PenBatchGeometryCm;
}

function readPersistedGeometry(): PersistedGeometry | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LS_GEOMETRY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedGeometry>;
    if (parsed.preset !== "standard" && parsed.preset !== "long" && parsed.preset !== "custom") {
      return null;
    }
    const custom = parsed.custom;
    if (
      !custom ||
      typeof custom.widthCm !== "number" ||
      typeof custom.heightCm !== "number" ||
      typeof custom.gapHCm !== "number" ||
      typeof custom.gapVCm !== "number"
    ) {
      return null;
    }
    return { preset: parsed.preset, custom: clampGeometryCm(custom) };
  } catch {
    return null;
  }
}

function writePersistedGeometry(v: PersistedGeometry): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_GEOMETRY_KEY, JSON.stringify(v));
  } catch {
    /* storage full / disabled — operator can re-dial on next session */
  }
}

interface Props {
  /** Bumped by the parent when the tool successfully persists a new batch. */
  onSaved?: () => void;
  /** Default `false` (collapsed). The standalone `/admin/workshop-batches` page sets it true. */
  defaultOpen?: boolean;
}

export function PenBatchLayoutTool({ onSaved, defaultOpen = false }: Props = {}) {
  const { t } = useLanguageStore();
  const s = t.workshopBoard;
  const sBatches = t.workshopBatches;

  const [collapsed, setCollapsed] = useState(!defaultOpen);
  const [tiles, setTiles] = useState<DroppedTile[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  // ─── Geometry (preset + custom cm) ────────────────────────────────────────
  //
  // SSR-safe: start with the standard preset, hydrate from localStorage on
  // the first client-side effect. The subsequent flip may cause a one-frame
  // mismatch of the "7.5×0.5" chip but never a hydration error (markup is
  // identical server-side vs client-first paint).
  const [preset, setPreset] = useState<PenBatchPresetId>("standard");
  const [customCm, setCustomCm] = useState<PenBatchGeometryCm>(PEN_PRESET_STANDARD);
  const [geometryHydrated, setGeometryHydrated] = useState(false);

  useEffect(() => {
    const persisted = readPersistedGeometry();
    if (persisted) {
      setPreset(persisted.preset);
      setCustomCm(persisted.custom);
    }
    setGeometryHydrated(true);
  }, []);

  useEffect(() => {
    if (!geometryHydrated) return;
    writePersistedGeometry({ preset, custom: customCm });
  }, [preset, customCm, geometryHydrated]);

  // Effective cm → px geometry fed to compose / grid / off-spec checks.
  const geometryCm: PenBatchGeometryCm = useMemo(() => {
    if (preset === "custom") return clampGeometryCm(customCm);
    return PEN_PRESETS[preset];
  }, [preset, customCm]);

  const geometry: PenBatchGeometry = useMemo(
    () => geometryFromCm(geometryCm),
    [geometryCm],
  );

  const isNonStandard = useMemo(
    () => !geometryCmEquals(geometryCm, PEN_PRESET_STANDARD),
    [geometryCm],
  );

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

  // Probe every not-yet-checked tile for its `pHYs` DPI (async, tiny I/O).
  useEffect(() => {
    const pending = tiles.filter((tile) => !tile.dpiProbed);
    if (pending.length === 0) return;
    let cancelled = false;
    void Promise.all(
      pending.map(async (tile) => {
        const dpi = await readSourceDpiFromFile(tile.file).catch(() => null);
        return { key: tile.key, dpi };
      }),
    ).then((results) => {
      if (cancelled) return;
      setTiles((prev) =>
        prev.map((tile) => {
          const hit = results.find((r) => r.key === tile.key);
          if (!hit) return tile;
          return { ...tile, actualDpi: hit.dpi, dpiProbed: true };
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [tiles]);

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
      const result = await composePenBatchPng(files, { geometry });
      const parsed = tiles.map((tile) => tile.parsed);
      const fileName = buildPenBatchFileName(parsed);
      downloadBlob(result.blob, fileName);
      try {
        await uploadWorkshopBatch({
          kind: "pen",
          fileName,
          tileCount: tiles.length,
          blob: result.blob,
        });
        onSaved?.();
      } catch (uploadError) {
        console.error("Pen batch history upload failed:", uploadError);
        setUploadWarning(sBatches.historyUploadWarn);
      }
    } catch (error) {
      console.error("Pen batch compose failed:", error);
      setErrorMessage(s.penBatchError);
    } finally {
      setBusy(false);
    }
  }, [canCompose, tiles, geometry, s.penBatchError, sBatches.historyUploadWarn, onSaved]);

  // Projected output size from the current tile count — pure math, no async.
  const projected = useMemo(() => {
    if (tiles.length < PEN_BATCH_MIN_FILES) return null;
    const grid = computePenBatchGrid(tiles.length, geometry);
    return {
      widthPx: grid.canvasWidthPx,
      heightPx: grid.canvasHeightPx,
      widthCm: pxToCm(grid.canvasWidthPx, geometry.dpi),
      heightCm: pxToCm(grid.canvasHeightPx, geometry.dpi),
    };
  }, [tiles.length, geometry]);

  const offSpecCount = useMemo(
    () => tiles.reduce((n, tile) => n + (isOffSpec(tile, geometry) ? 1 : 0), 0),
    [tiles, geometry],
  );

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

          {/* ── Geometry panel ─────────────────────────────────────────────
           *   Standard / Длинная / Своё chips above the dropzone, with four
           *   cm inputs when "Своё" is active. All downstream math (grid
           *   preview, off-spec warnings, composer) reads from `geometry`
           *   so flipping a chip updates everything instantly. */}
          <div className="rounded-xl border border-pink-200 bg-white/60 px-3 py-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-pink-900/90 mr-1">
                {s.penGeometryTitle}
              </span>
              {(
                [
                  { id: "standard" as const, label: s.penGeometryPresetStandard },
                  { id: "long" as const, label: s.penGeometryPresetLong },
                  { id: "custom" as const, label: s.penGeometryPresetCustom },
                ]
              ).map((chip) => {
                const active = preset === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      if (chip.id === "custom") {
                        // Seed custom inputs from whatever preset was active
                        // so operator can nudge from a known baseline.
                        setCustomCm(
                          preset === "long"
                            ? PEN_PRESET_LONG
                            : preset === "custom"
                              ? customCm
                              : PEN_PRESET_STANDARD,
                        );
                      }
                      setPreset(chip.id);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      active
                        ? "border-pink-600 bg-pink-600 text-white"
                        : "border-pink-200 bg-white text-pink-800 hover:bg-pink-50",
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
              {isNonStandard && preset !== "standard" && (
                <button
                  type="button"
                  onClick={() => setPreset("standard")}
                  className="ml-auto text-[10px] text-pink-700 underline hover:text-pink-900"
                >
                  {s.penGeometryResetToStandard}
                </button>
              )}
            </div>

            {preset === "custom" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  { key: "widthCm", label: s.penGeometryFieldWidth },
                  { key: "heightCm", label: s.penGeometryFieldHeight },
                  { key: "gapHCm", label: s.penGeometryFieldGapH },
                  { key: "gapVCm", label: s.penGeometryFieldGapV },
                ] as const).map((field) => (
                  <label
                    key={field.key}
                    className="flex flex-col gap-0.5 text-[10px] text-pink-900/80"
                  >
                    <span>{field.label}</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={customCm[field.key]}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        setCustomCm((prev) => ({
                          ...prev,
                          [field.key]: Number.isFinite(raw) ? raw : prev[field.key],
                        }));
                      }}
                      className="h-7 w-full rounded border border-pink-200 bg-white px-2 text-xs text-pink-900 focus:outline-none focus:ring-1 focus:ring-pink-400"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-pink-900/70 tabular-nums">
                {s.penGeometrySummary(
                  geometryCm.widthCm,
                  geometryCm.heightCm,
                  geometryCm.gapHCm,
                  geometryCm.gapVCm,
                )}
              </p>
            )}
          </div>

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

          {offSpecCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">{s.penBatchOffSpecBanner(offSpecCount)}</p>
                <p className="mt-0.5 text-amber-900/80">{s.penBatchStandardHint}</p>
              </div>
            </div>
          )}

          {tiles.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tiles.map((tile, index) => {
                const label = tileLabel(tile, index + 1);
                const isUnknown = tile.parsed.color.slug === "unknown";
                const wrongSize = hasWrongPixelSize(tile, geometry);
                const wrongDpi = hasWrongDpi(tile, geometry);
                const offSpec = wrongSize || wrongDpi;
                return (
                  <li
                    key={tile.key}
                    className={cn(
                      "relative flex items-stretch gap-2 rounded-lg border bg-white p-2 shadow-sm",
                      offSpec ? "border-amber-300" : "border-pink-200",
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
                        {offSpec &&
                          tile.actualWidthPx !== null &&
                          tile.actualHeightPx !== null && (
                            <p className="mt-0.5 inline-flex items-start gap-1 text-[10px] font-medium text-amber-800">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                              <span>
                                {s.penBatchOffSpec(
                                  tile.actualWidthPx,
                                  tile.actualHeightPx,
                                  tile.actualDpi,
                                )}
                              </span>
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

          {uploadWarning && (
            <p className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              {uploadWarning}
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
