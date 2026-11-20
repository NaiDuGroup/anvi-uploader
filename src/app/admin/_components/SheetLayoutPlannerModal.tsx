"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, AlertTriangle, Download, RotateCcw, CheckCircle2 } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { prepareTiles, type PreparedTile } from "@/lib/largeFormat/layoutTiles";
import {
  applyOrientationPins,
  isSquareTile,
  type OrientationPin,
} from "@/lib/largeFormat/layoutOrientationPins";
import { lfSheetSizeCmLabel, lfSheetsCountRu, type LfSheetSpec } from "@/lib/largeFormat/lfSheet";
import {
  packTilesOnSheets,
  pieceFitsSheetAs,
  sheetsWithoutPooling,
  type LfSheetLayoutSheet,
} from "@/lib/largeFormat/lfSheetLayoutPack";
import type { WorkshopBoardGroup } from "@/lib/workshopBoard/types";
import { heldForLayoutCount, lfPlannerLines } from "@/lib/workshopBoard/productionPick";
import { buildRollLayoutPdfFileName } from "@/lib/largeFormat/rollLayoutPdfFileName";
import {
  LineSelectionPanel,
  MetricRow,
  TILE_COLORS,
  buildOrderColorMap,
  buildTileFileEntries,
} from "./LayoutPlannerModal";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

const MIN_LABEL_SIZE_CM = 8;
const SHEET_RENDER_WIDTH_PX = 230;

/** The group's sheet (size + margin) from its first sheet line. */
function groupSheetSpec(group: WorkshopBoardGroup): LfSheetSpec | null {
  for (const l of group.lines) {
    if (l.facts.kind === "lf" && l.facts.data.sheets) {
      const s = l.facts.data.sheets;
      return { sheetWidthCm: s.sheetWidthCm, sheetHeightCm: s.sheetHeightCm, marginMm: s.marginMm };
    }
  }
  return null;
}

function SheetSvg({
  sheet,
  spec,
  tiles,
  orientationPins,
  caption,
  onTileClick,
}: {
  sheet: LfSheetLayoutSheet;
  spec: LfSheetSpec;
  tiles: ReadonlyMap<string, PreparedTile>;
  orientationPins: ReadonlyMap<string, OrientationPin>;
  caption: string;
  onTileClick: (tileId: string) => void;
}) {
  const W = spec.sheetWidthCm;
  const H = spec.sheetHeightCm;
  const m = Math.max(0, spec.marginMm) / 10;
  const scale = SHEET_RENDER_WIDTH_PX / W;
  const baseFontCm = Math.max(1.4, Math.min(W, H) * 0.035);
  return (
    <figure className="flex flex-col items-center gap-1" data-testid={`lf-sheet-layout-sheet-${sheet.index + 1}`}>
      <figcaption className="text-[11px] font-semibold text-gray-600">
        {caption} · {sheet.placements.length} шт
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W * scale}
        height={H * scale}
        style={{ display: "block", maxWidth: "100%" }}
        aria-label={caption}
      >
        <defs>
          <pattern id={`sheetMargin${sheet.index}`} patternUnits="userSpaceOnUse" width={2} height={2}>
            <rect width={2} height={2} fill="#e2e8f0" />
            <path d="M0,2 L2,0" stroke="#cbd5e1" strokeWidth={0.4} />
          </pattern>
        </defs>
        {/* Sheet with its non-printable margin hatched */}
        <rect x={0} y={0} width={W} height={H} fill={`url(#sheetMargin${sheet.index})`} stroke="#64748b" strokeWidth={0.3} />
        <rect x={m} y={m} width={W - 2 * m} height={H - 2 * m} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.2} />
        {sheet.placements.map((p) => {
          const tile = tiles.get(p.tileId);
          const { fill, stroke, text } = TILE_COLORS[(tile?.colorIdx ?? 0) % TILE_COLORS.length]!;
          const canRotate = tile != null && !isSquareTile(tile);
          const showLabel = Math.min(p.widthCm, p.heightCm) >= MIN_LABEL_SIZE_CM;
          const pinned = orientationPins.has(p.tileId);
          return (
            <g
              key={p.tileId}
              data-testid={`lf-sheet-tile-${p.tileId}`}
              onClick={canRotate ? () => onTileClick(p.tileId) : undefined}
              style={canRotate ? { cursor: "pointer", outline: "none" } : undefined}
              role={canRotate ? "button" : undefined}
              tabIndex={canRotate ? 0 : undefined}
              onKeyDown={
                canRotate
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onTileClick(p.tileId);
                      }
                    }
                  : undefined
              }
            >
              <rect x={p.xCm} y={p.yCm} width={p.widthCm} height={p.heightCm} fill={fill} stroke={stroke} strokeWidth={0.35} />
              {showLabel && (
                <>
                  <text
                    x={p.xCm + p.widthCm / 2}
                    y={p.yCm + p.heightCm / 2 - baseFontCm * 0.2}
                    textAnchor="middle"
                    fontSize={Math.min(baseFontCm, p.heightCm * 0.22, p.widthCm * 0.13)}
                    fontFamily="system-ui, sans-serif"
                    fontWeight="600"
                    fill={text}
                    style={{ userSelect: "none", pointerEvents: "none" }}
                  >
                    {tile?.label ?? p.label}
                  </text>
                  <text
                    x={p.xCm + p.widthCm / 2}
                    y={p.yCm + p.heightCm / 2 + baseFontCm * 1.2}
                    textAnchor="middle"
                    fontSize={Math.min(baseFontCm * 0.75, p.heightCm * 0.18, p.widthCm * 0.1)}
                    fontFamily="system-ui, sans-serif"
                    fill={text}
                    opacity={0.78}
                    style={{ userSelect: "none", pointerEvents: "none" }}
                  >
                    {`${p.widthCm}×${p.heightCm}`}
                    {p.rotated ? " ↻" : ""}
                    {pinned ? " ✦" : ""}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Line printed in a confirmed pooled layout (its share is already on the ledger). */
function linePool(line: WorkshopBoardGroup["lines"][number]) {
  return line.facts.kind === "lf" ? (line.facts.data.sheets?.pooled ?? null) : null;
}

export interface SheetLayoutPlannerModalProps {
  group: WorkshopBoardGroup;
  onClose: () => void;
  /** After «Подтвердить печать» changed stock / costs (the board reloads). */
  onStockChanged?: () => void;
}

/**
 * Sheet layout of a sheet-material group (VATMAN A1): the selected lines'
 * pieces pooled on whole sheets, one PDF page per sheet. Same look and
 * behaviour as the roll {@link LayoutPlannerModal}.
 */
export function SheetLayoutPlannerModal({ group, onClose, onStockChanged }: SheetLayoutPlannerModalProps) {
  useBodyScrollLock();
  const { t } = useLanguageStore();
  const wb = t.workshopBoard;
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const spec = useMemo(() => groupSheetSpec(group), [group]);
  const lfLines = useMemo(() => lfPlannerLines(group.lines), [group.lines]);
  const heldCount = useMemo(() => heldForLayoutCount(group.lines), [group.lines]);
  const orderColorMap = useMemo(() => buildOrderColorMap(lfLines), [lfLines]);

  // Lines already printed in a confirmed pooled layout start unchecked.
  const [selectedLineIds, setSelectedLineIds] = useState<ReadonlySet<string>>(
    () => new Set(lfLines.filter((l) => !linePool(l)).map((l) => l.orderLineId)),
  );
  const pooledLines = useMemo(() => lfLines.filter((l) => linePool(l)), [lfLines]);
  const toggleLine = useCallback((orderLineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderLineId)) next.delete(orderLineId);
      else next.add(orderLineId);
      return next;
    });
  }, []);
  const selectAllLines = useCallback(() => setSelectedLineIds(new Set(lfLines.map((l) => l.orderLineId))), [lfLines]);
  const deselectAllLines = useCallback(() => setSelectedLineIds(new Set()), []);

  const filteredLines = useMemo(
    () => lfLines.filter((l) => selectedLineIds.has(l.orderLineId)),
    [lfLines, selectedLineIds],
  );

  const tiles = useMemo(() => prepareTiles(filteredLines, orderColorMap, true), [filteredLines, orderColorMap]);
  const tileById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles]);

  const [orientationPins, setOrientationPins] = useState<ReadonlyMap<string, OrientationPin>>(() => new Map());
  useEffect(() => {
    setOrientationPins((prev) => {
      let changed = false;
      const next = new Map<string, OrientationPin>();
      for (const [id, pin] of prev) {
        if (tileById.has(id)) next.set(id, pin);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [tileById]);

  const packingTiles = useMemo(() => applyOrientationPins(tiles, orientationPins), [tiles, orientationPins]);

  const result = useMemo(() => {
    if (!spec) return null;
    const packed = packTilesOnSheets(packingTiles, spec);
    if (orientationPins.size === 0) return packed;
    // Pinned pieces were packed pre-swapped: restore their `rotated` flag for the PDF.
    return {
      ...packed,
      sheets: packed.sheets.map((s) => ({
        ...s,
        placements: s.placements.map((p) => {
          const pin = orientationPins.get(p.tileId);
          return pin ? { ...p, rotated: pin === "rotated" } : p;
        }),
      })),
    };
  }, [spec, packingTiles, orientationPins]);

  const sheetsCount = result?.sheets.length ?? 0;
  const naiveSheets = useMemo(() => (spec ? sheetsWithoutPooling(tiles, spec) : 0), [tiles, spec]);
  const savedSheets = Math.max(0, naiveSheets - sheetsCount);

  const handleTileClick = useCallback(
    (tileId: string) => {
      const tile = tileById.get(tileId);
      if (!tile || !spec || isSquareTile(tile)) return;
      const placement = result?.sheets.flatMap((s) => s.placements).find((p) => p.tileId === tileId);
      if (!placement) return;
      setOrientationPins((prev) => {
        const next = new Map(prev);
        if (prev.has(tileId)) {
          next.delete(tileId);
          return next;
        }
        const opposite: OrientationPin = placement.rotated ? "natural" : "rotated";
        const fits =
          opposite === "rotated"
            ? pieceFitsSheetAs(tile.heightCm, tile.widthCm, spec)
            : pieceFitsSheetAs(tile.widthCm, tile.heightCm, spec);
        if (!fits) return prev;
        next.set(tileId, opposite);
        return next;
      });
    },
    [tileById, spec, result],
  );

  const tileFileEntries = useMemo(() => buildTileFileEntries(filteredLines, tiles), [filteredLines, tiles]);
  const borderCmByTileId = useMemo(() => {
    const map = new Map<string, number>();
    for (const tile of tiles) if (tile.borderCm > 0) map.set(tile.id, tile.borderCm);
    return map;
  }, [tiles]);
  const usesGalleryWrap = tiles.some((tile) => tile.galleryWrapCm > 0);
  const fileNamesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of group.lines) for (const f of line.files) map.set(f.id, f.fileName);
    return map;
  }, [group.lines]);

  const unplacedCount = result?.unplacedTileIds.length ?? 0;
  const canDownloadPdf =
    spec != null && tiles.length > 0 && unplacedCount === 0 && tileFileEntries.length === tiles.length;

  const handleDownloadPdf = useCallback(async () => {
    if (!canDownloadPdf || !result || !spec) return;
    setPdfError(null);
    setPdfLoading(true);
    const sheets = result.sheets.map((s) => s.placements);
    const orderNumbers = filteredLines.map((l) => l.orderNumber);
    try {
      if (usesGalleryWrap) {
        // Mirrored pixels need sharp: the server builds and stores the PDF.
        const res = await fetch("/api/workshop-board/layout-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout: "sheet", materialLabel: group.label, orderNumbers, sheets, tiles: tileFileEntries }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? wb.layoutPdfError);
        }
        const { downloadUrl } = (await res.json()) as { downloadUrl: string };
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return;
      }
      const { buildSheetLayoutPdfInBrowser } = await import("@/lib/largeFormat/buildRollLayoutPdfClient");
      const pdfBytes = await buildSheetLayoutPdfInBrowser({
        sheetWidthCm: spec.sheetWidthCm,
        sheetHeightCm: spec.sheetHeightCm,
        sheets,
        tiles: tileFileEntries,
        fileNamesById,
        borderCmByTileId,
      });
      const fileName = buildRollLayoutPdfFileName(group.label, orderNumbers);
      const blob = new Blob([Uint8Array.from(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : wb.layoutPdfError);
    } finally {
      setPdfLoading(false);
    }
  }, [
    canDownloadPdf,
    result,
    spec,
    filteredLines,
    usesGalleryWrap,
    group.label,
    tileFileEntries,
    fileNamesById,
    borderCmByTileId,
    wb.layoutPdfError,
  ]);

  // ── Confirm print: give the sheets saved by pooling back to stock ─────────
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirmInFlightRef = useRef(false);
  const selectedPooled = filteredLines.some((l) => linePool(l));
  const canConfirmSheets =
    spec != null && result != null && tiles.length > 0 && unplacedCount === 0 && savedSheets > 0 && !selectedPooled;

  const handleConfirmSheets = useCallback(async () => {
    if (confirmInFlightRef.current || !canConfirmSheets || !spec) return;
    confirmInFlightRef.current = true;
    setConfirmBusy(true);
    setConfirmError(null);
    setConfirmMessage(null);
    const lineIds = filteredLines.map((l) => l.orderLineId);
    try {
      const res = await fetch("/api/workshop-board/confirm-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderLineIds: lineIds, poolSheets: sheetsCount }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(wb.layoutConfirmSheetsError(data?.error ?? ""));
      }
      const data = (await res.json()) as {
        alreadyConfirmed: boolean;
        noSaving: boolean;
        returnedSheets: number;
      };
      if (data.alreadyConfirmed) setConfirmMessage(wb.layoutConfirmSheetsAlready);
      else if (data.noSaving) setConfirmMessage(wb.layoutConfirmSheetsNoSaving);
      else {
        setConfirmMessage(wb.layoutConfirmSheetsDone(lfSheetsCountRu(data.returnedSheets, spec)));
        // Confirmed lines leave the selection; the board reloads with their pool.
        setSelectedLineIds((prev) => {
          const next = new Set(prev);
          for (const id of lineIds) next.delete(id);
          return next;
        });
        onStockChanged?.();
      }
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : wb.layoutConfirmSheetsError(""));
    } finally {
      confirmInFlightRef.current = false;
      setConfirmBusy(false);
    }
  }, [canConfirmSheets, spec, filteredLines, sheetsCount, wb, onStockChanged]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={wb.layoutModalTitle(group.label)}
      data-testid="lf-sheet-layout-modal"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900">{wb.layoutModalTitle(group.label)}</h2>
            <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-gray-500">
              {spec && (
                <span data-testid="lf-sheet-layout-info">
                  {wb.layoutSheetInfo(lfSheetSizeCmLabel(spec), spec.marginMm, sheetsCount)}
                </span>
              )}
              <span>{wb.layoutTilesCount(tiles.length)}</span>
              {heldCount > 0 && <span>{t.layoutIssue.heldInLayout(heldCount)}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={wb.layoutClose}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-6 lg:flex-row">
          <div className="min-w-0 flex-1">
            {!spec || !result || tiles.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
                {lfLines.length > 0 ? wb.layoutNoLinesSelected : "Нет макетов для раскладки"}
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gradient-to-br from-slate-50 to-slate-100 p-3">
                <div className="flex flex-wrap justify-center gap-4">
                  {result.sheets.map((sheet) => (
                    <SheetSvg
                      key={sheet.index}
                      sheet={sheet}
                      spec={spec}
                      tiles={tileById}
                      orientationPins={orientationPins}
                      caption={wb.layoutSheetCaption(sheet.index + 1)}
                      onTileClick={handleTileClick}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-snug text-gray-500">{wb.layoutRotateHint}</p>
              </div>
            )}
          </div>

          {/* Metrics panel */}
          <div className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
            {lfLines.length > 0 && (
              <LineSelectionPanel
                lines={lfLines}
                selectedLineIds={selectedLineIds}
                orderColorMap={orderColorMap}
                onToggle={toggleLine}
                onSelectAll={selectAllLines}
                onDeselectAll={deselectAllLines}
              />
            )}
            {orientationPins.size > 0 && (
              <button
                type="button"
                onClick={() => setOrientationPins(new Map())}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {wb.layoutResetPins}
              </button>
            )}
            <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4" data-testid="lf-sheet-layout-summary">
              <MetricRow label={wb.layoutSheetsTotal(sheetsCount)} highlight={false} />
              {naiveSheets > sheetsCount && <MetricRow label={wb.layoutSheetsNaive(naiveSheets)} highlight={false} />}
              {savedSheets > 0 && <MetricRow label={wb.layoutSheetsSaved(savedSheets)} highlight />}
            </div>
            {pooledLines.length > 0 && (
              <div
                className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] text-emerald-800"
                data-testid="lf-sheet-layout-pooled"
              >
                {pooledLines.map((l) => {
                  const pool = linePool(l)!;
                  return (
                    <div key={l.orderLineId} className="flex items-start gap-1.5">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>
                        #{l.orderNumber}
                        {l.totalLines > 1 ? `.${l.lineIndex}` : ""} —{" "}
                        {wb.layoutSheetPooledBadge(
                          spec ? lfSheetsCountRu(pool.poolSheets, spec) : String(pool.poolSheets),
                          pool.orderNumbers.map((n) => `#${n}`).join(", "),
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {unplacedCount > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{wb.layoutUnplaced(unplacedCount)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-gray-100 px-6 py-3">
          {pdfError && (
            <p className="text-[12px] text-red-600" role="alert">
              {pdfError}
            </p>
          )}
          {confirmError && (
            <p className="text-[12px] text-red-600" role="alert">
              {confirmError}
            </p>
          )}
          {confirmMessage && (
            <p className="text-[12px] text-emerald-700" data-testid="lf-sheet-confirm-message">
              {confirmMessage}
            </p>
          )}
          {canConfirmSheets && !confirmMessage && (
            <p className="text-[11px] text-gray-500">{wb.layoutConfirmSheetsHint}</p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!canDownloadPdf || pdfLoading}
              title={
                tiles.length === 0 ? wb.layoutNoLinesSelected : unplacedCount > 0 ? wb.layoutPdfUnplacedBlocked : undefined
              }
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              {pdfLoading ? wb.layoutGeneratingPdf : wb.layoutDownloadPdf}
            </button>
            {spec && savedSheets > 0 && (
              <button
                type="button"
                onClick={handleConfirmSheets}
                disabled={!canConfirmSheets || confirmBusy}
                title={selectedPooled ? wb.layoutConfirmSheetsError("line_already_confirmed") : undefined}
                data-testid="lf-sheet-confirm-print"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {confirmBusy ? wb.layoutConfirmSheetsBusy : wb.layoutConfirmSheetsCta(lfSheetsCountRu(sheetsCount, spec))}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              {wb.layoutClose}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
