"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { X, AlertTriangle, Download } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { resolveEffectivePrintableWidthMeters } from "@/lib/largeFormat/largeFormatRollConstants";
import {
  resolveGalleryWrapCm,
  resolveLayoutBorderCm,
} from "@/lib/largeFormat/lfLayoutBorder";
import {
  packGroupTiles,
  GROUP_TILE_PACK_DEFAULT_GAP_CM,
  type GroupTilePackTile,
  type GroupTilePackResult,
} from "@/lib/largeFormat/groupTilePack";
import type { WorkshopBoardGroup, WorkshopBoardLine } from "@/lib/workshopBoard/types";

// ─── Colour palette for tiles (cycled by order number) ────────────────────────

const TILE_COLORS = [
  { fill: "#dbeafe", stroke: "#3b82f6", text: "#1e40af" },
  { fill: "#dcfce7", stroke: "#22c55e", text: "#15803d" },
  { fill: "#fef9c3", stroke: "#eab308", text: "#854d0e" },
  { fill: "#fce7f3", stroke: "#ec4899", text: "#9d174d" },
  { fill: "#ede9fe", stroke: "#8b5cf6", text: "#5b21b6" },
  { fill: "#ffedd5", stroke: "#f97316", text: "#9a3412" },
  { fill: "#ccfbf1", stroke: "#14b8a6", text: "#115e59" },
  { fill: "#e0e7ff", stroke: "#6366f1", text: "#3730a3" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface PreparedTile extends GroupTilePackTile {
  colorIdx: number;
  /** White margin (cm) added on every side; 0 for materials without a border. */
  borderCm: number;
  /**
   * Mirrored gallery-wrap margin (cm) added on every side for canvas; 0
   * otherwise. Mutually exclusive with {@link borderCm}: white band vs mirror.
   */
  galleryWrapCm: number;
}

function prepareTiles(lines: WorkshopBoardLine[]): PreparedTile[] {
  const tiles: PreparedTile[] = [];
  const orderNumbers = [...new Set(lines.map((l) => l.orderNumber))];
  const orderColorMap = new Map(orderNumbers.map((n, i) => [n, i % TILE_COLORS.length]));

  for (const line of lines) {
    if (line.facts.kind !== "lf") continue;
    const { widthCm, heightCm, quantity, materialName } = line.facts.data;
    const { orderNumber, orderLineId, lineIndex, totalLines } = line;
    const colorIdx = orderColorMap.get(orderNumber) ?? 0;
    // Some materials grow the footprint by an extra margin on every side:
    //  • BANNER MATT → a blank white band (`borderCm`)
    //  • canvas / "Panza din bumbac" → a mirrored gallery-wrap (`galleryWrapCm`)
    // Both inflate the roll footprint by 2× the margin per axis (mutually
    // exclusive, but summed defensively).
    const borderCm = resolveLayoutBorderCm(materialName);
    const galleryWrapCm = resolveGalleryWrapCm(materialName);
    const marginCm = borderCm + galleryWrapCm;

    for (let copy = 1; copy <= quantity; copy++) {
      const label = totalLines > 1
        ? `#${orderNumber}.${lineIndex}/${totalLines} (${copy}/${quantity})`
        : `#${orderNumber} (${copy}/${quantity})`;
      tiles.push({
        id: `${orderLineId}::${copy}`,
        label,
        widthCm: widthCm + 2 * marginCm,
        heightCm: heightCm + 2 * marginCm,
        allowRotate: true,
        colorIdx,
        borderCm,
        galleryWrapCm,
      });
    }
  }
  return tiles;
}

function parseTileId(tileId: string): { orderLineId: string; copy: number } {
  const sep = tileId.lastIndexOf("::");
  return {
    orderLineId: tileId.slice(0, sep),
    copy: parseInt(tileId.slice(sep + 2), 10),
  };
}

function resolveTileFileId(line: WorkshopBoardLine, copy: number): string | null {
  const { files } = line;
  if (files.length === 0) return null;
  if (copy >= 1 && copy <= files.length) return files[copy - 1]!.id;
  return files[0]!.id;
}

function buildTileFileEntries(
  lines: WorkshopBoardLine[],
  tiles: PreparedTile[],
): Array<{ tileId: string; fileId: string }> {
  const lineById = new Map(lines.map((l) => [l.orderLineId, l]));
  const entries: Array<{ tileId: string; fileId: string }> = [];
  for (const tile of tiles) {
    const { orderLineId, copy } = parseTileId(tile.id);
    const line = lineById.get(orderLineId);
    if (!line) continue;
    const fileId = resolveTileFileId(line, copy);
    if (fileId) entries.push({ tileId: tile.id, fileId });
  }
  return entries;
}

/**
 * Naïve total: what the algorithm would produce if every tile were laid out
 * on its own row of the roll (no side-by-side sharing). Uses the same gapCm
 * inflation as packGroupTiles, so savings ≥ 0 whenever any tiles share a row.
 */
function naiveLengthCm(
  tiles: PreparedTile[],
  printableWidthCm: number,
  gapCm: number,
): number {
  return tiles.reduce((sum, tile) => {
    let h = tile.heightCm;
    if (tile.widthCm + gapCm > printableWidthCm + 1e-6 && tile.allowRotate) {
      h = tile.widthCm;
    }
    return sum + h + gapCm;
  }, 0);
}

// ─── SVG preview ──────────────────────────────────────────────────────────────

const MIN_LABEL_WIDTH_CM = 8;
/** Bounds on rendered preview size — keep the roll compact even for short layouts. */
const SVG_MAX_RENDER_WIDTH_PX = 460;
const SVG_MAX_RENDER_HEIGHT_PX = 720;
const SVG_MIN_RENDER_HEIGHT_PX = 220;

interface LayoutSvgPreviewProps {
  result: GroupTilePackResult;
  tiles: PreparedTile[];
  /** Nominal roll width in cm (e.g. 127 for 1.27 m). Used to render dead-zone margins. */
  rollWidthCm: number;
}

function LayoutSvgPreview({ result, tiles, rollWidthCm }: LayoutSvgPreviewProps) {
  const { placements, printableWidthCm, totalAlongCm, gapCm } = result;
  const tileMap = useMemo(
    () => new Map(tiles.map((t) => [t.id, t])),
    [tiles],
  );

  // Render dead-zone margins (between roll edge and printable area).
  // Default: split trim evenly across both edges so the printable area is centred.
  const trimCm = Math.max(0, rollWidthCm - printableWidthCm);
  const leftMarginCm = trimCm / 2;
  const rightMarginCm = trimCm / 2;
  const viewWidthCm = printableWidthCm + trimCm;
  const viewHeightCm = Math.max(totalAlongCm, 8);

  // Scale view to fit comfortably in the modal: width-first, then cap height.
  const widthScale = SVG_MAX_RENDER_WIDTH_PX / viewWidthCm;
  const heightScale = SVG_MAX_RENDER_HEIGHT_PX / viewHeightCm;
  const scale = Math.min(widthScale, heightScale);
  const renderW = viewWidthCm * scale;
  const renderH = Math.max(viewHeightCm * scale, SVG_MIN_RENDER_HEIGHT_PX);

  // Choose font size as a fraction of the diagonal — readable but never huge.
  const baseFontCm = Math.max(1.4, Math.min(viewWidthCm, viewHeightCm) * 0.025);

  return (
    <div className="relative overflow-auto rounded-lg border border-gray-200 bg-gradient-to-br from-slate-50 to-slate-100 p-3">
      <svg
        viewBox={`0 0 ${viewWidthCm} ${viewHeightCm}`}
        width={renderW}
        height={renderH}
        style={{ display: "block", maxWidth: "100%" }}
        aria-label="Roll layout preview"
      >
        {/* Dead-zone (unprintable) margins on each side of the roll */}
        {leftMarginCm > 0 && (
          <rect
            x={0}
            y={0}
            width={leftMarginCm}
            height={viewHeightCm}
            fill="url(#deadZonePattern)"
            opacity={0.5}
          />
        )}
        {rightMarginCm > 0 && (
          <rect
            x={leftMarginCm + printableWidthCm}
            y={0}
            width={rightMarginCm}
            height={viewHeightCm}
            fill="url(#deadZonePattern)"
            opacity={0.5}
          />
        )}

        <defs>
          <pattern id="deadZonePattern" patternUnits="userSpaceOnUse" width={2} height={2}>
            <rect width={2} height={2} fill="#e2e8f0" />
            <path d="M0,2 L2,0" stroke="#cbd5e1" strokeWidth={0.4} />
          </pattern>
        </defs>

        {/* Printable area background */}
        <rect
          x={leftMarginCm}
          y={0}
          width={printableWidthCm}
          height={viewHeightCm}
          fill="#ffffff"
          stroke="#cbd5e1"
          strokeWidth={0.25}
        />

        {/* Tiles */}
        {placements.map((p) => {
          const tile = tileMap.get(p.tileId);
          const colorIdx = tile?.colorIdx ?? 0;
          const { fill, stroke, text } = TILE_COLORS[colorIdx % TILE_COLORS.length]!;
          const showLabel = Math.min(p.widthCm, p.heightCm) >= MIN_LABEL_WIDTH_CM;
          const px = p.xCm + leftMarginCm;
          // Both the white border (BANNER MATT) and the mirrored gallery-wrap
          // (canvas) inset the visible face by the same margin; show it dashed.
          const marginCm = (tile?.borderCm ?? 0) + (tile?.galleryWrapCm ?? 0);
          const isGalleryWrap = (tile?.galleryWrapCm ?? 0) > 0;
          const showPrintArea =
            marginCm > 0 &&
            p.widthCm - 2 * marginCm > 0 &&
            p.heightCm - 2 * marginCm > 0;

          return (
            <g key={p.tileId}>
              <rect
                x={px}
                y={p.yCm}
                width={p.widthCm}
                height={p.heightCm}
                fill={fill}
                stroke={stroke}
                strokeWidth={0.35}
                rx={0.4}
              />
              {showPrintArea && (
                <rect
                  x={px + marginCm}
                  y={p.yCm + marginCm}
                  width={p.widthCm - 2 * marginCm}
                  height={p.heightCm - 2 * marginCm}
                  fill={isGalleryWrap ? "none" : "#ffffff"}
                  fillOpacity={isGalleryWrap ? undefined : 0.55}
                  stroke={stroke}
                  strokeWidth={0.3}
                  strokeDasharray="1 0.8"
                />
              )}
              {showLabel && (
                <>
                  <text
                    x={px + p.widthCm / 2}
                    y={p.yCm + p.heightCm / 2 - baseFontCm * 0.2}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fontSize={Math.min(baseFontCm, p.heightCm * 0.22, p.widthCm * 0.13)}
                    fontFamily="system-ui, sans-serif"
                    fontWeight="600"
                    fill={text}
                    style={{ userSelect: "none" }}
                  >
                    {tile?.label ?? p.label}
                  </text>
                  <text
                    x={px + p.widthCm / 2}
                    y={p.yCm + p.heightCm / 2 + baseFontCm * 1.2}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fontSize={Math.min(baseFontCm * 0.75, p.heightCm * 0.18, p.widthCm * 0.1)}
                    fontFamily="system-ui, sans-serif"
                    fill={text}
                    opacity={0.78}
                    style={{ userSelect: "none" }}
                  >
                    {`${p.widthCm}×${p.heightCm}`}
                    {p.rotated ? " ↻" : ""}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Roll-edge ticks (top + bottom) */}
        <line
          x1={leftMarginCm}
          y1={0}
          x2={leftMarginCm + printableWidthCm}
          y2={0}
          stroke="#64748b"
          strokeWidth={0.25}
        />
        <line
          x1={leftMarginCm}
          y1={viewHeightCm}
          x2={leftMarginCm + printableWidthCm}
          y2={viewHeightCm}
          stroke="#64748b"
          strokeWidth={0.25}
          strokeDasharray="1 1"
        />

        {/* Width tick label (top of printable area) */}
        <text
          x={leftMarginCm + 0.4}
          y={baseFontCm}
          fontSize={baseFontCm * 0.85}
          fontFamily="system-ui, sans-serif"
          fill="#475569"
          style={{ userSelect: "none" }}
        >
          {`${printableWidthCm} cm`}
        </text>

        {/* Length tick label (bottom of printable area) */}
        {totalAlongCm > 0 && (
          <text
            x={leftMarginCm + 0.4}
            y={viewHeightCm - 0.4}
            fontSize={baseFontCm * 0.85}
            fontFamily="system-ui, sans-serif"
            fill="#475569"
            style={{ userSelect: "none" }}
          >
            {`${(totalAlongCm / 100).toFixed(2)} m`}
          </text>
        )}

        {/* Gap annotation */}
        {gapCm > 0 && (
          <text
            x={leftMarginCm + printableWidthCm - 0.4}
            y={baseFontCm}
            textAnchor="end"
            fontSize={baseFontCm * 0.75}
            fontFamily="system-ui, sans-serif"
            fill="#64748b"
            style={{ userSelect: "none" }}
          >
            {`↕ ${gapCm}`}
          </text>
        )}
      </svg>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export interface LayoutPlannerModalProps {
  group: WorkshopBoardGroup;
  onClose: () => void;
}

export function LayoutPlannerModal({ group, onClose }: LayoutPlannerModalProps) {
  const { t } = useLanguageStore();
  const wb = t.workshopBoard;
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const printableWidthCm = useMemo(() => {
    const m = resolveEffectivePrintableWidthMeters({
      printableWidthMeters: group.meta.printableWidthMeters,
      rollWidthMeters: group.meta.rollWidthMeters ?? "0",
    });
    return Math.round(m * 100);
  }, [group.meta]);

  const rollWidthCm = useMemo(() => {
    const raw = Number(group.meta.rollWidthMeters);
    if (!Number.isFinite(raw) || raw <= 0) return printableWidthCm;
    return Math.max(printableWidthCm, Math.round(raw * 100));
  }, [group.meta.rollWidthMeters, printableWidthCm]);

  const tiles = useMemo(() => prepareTiles(group.lines), [group.lines]);

  const result = useMemo(
    () => packGroupTiles(tiles, printableWidthCm, GROUP_TILE_PACK_DEFAULT_GAP_CM),
    [tiles, printableWidthCm],
  );

  const naiveCm = useMemo(
    () => naiveLengthCm(tiles, printableWidthCm, GROUP_TILE_PACK_DEFAULT_GAP_CM),
    [tiles, printableWidthCm],
  );
  const naiveM = naiveCm / 100;
  const currentM = result.totalAlongCm / 100;
  const savedM = naiveM - currentM;
  const savedPct = naiveM > 0 ? (savedM / naiveM) * 100 : 0;

  const tileFileEntries = useMemo(
    () => buildTileFileEntries(group.lines, tiles),
    [group.lines, tiles],
  );

  const borderCmByTileId = useMemo(() => {
    const map = new Map<string, number>();
    for (const tile of tiles) {
      if (tile.borderCm > 0) map.set(tile.id, tile.borderCm);
    }
    return map;
  }, [tiles]);

  const layoutBorderCm = useMemo(
    () => tiles.reduce((max, t) => Math.max(max, t.borderCm), 0),
    [tiles],
  );

  const layoutGalleryWrapCm = useMemo(
    () => tiles.reduce((max, t) => Math.max(max, t.galleryWrapCm), 0),
    [tiles],
  );

  /** Canvas needs real mirrored pixels (sharp) → build PDF on the server. */
  const usesGalleryWrap = layoutGalleryWrapCm > 0;

  const fileNamesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of group.lines) {
      for (const f of line.files) {
        map.set(f.id, f.fileName);
      }
    }
    return map;
  }, [group.lines]);

  const canDownloadPdf =
    tiles.length > 0 &&
    result.unplacedTileIds.length === 0 &&
    tileFileEntries.length === tiles.length;

  const handleDownloadPdf = useCallback(async () => {
    if (!canDownloadPdf) return;
    setPdfError(null);
    setPdfLoading(true);
    try {
      if (usesGalleryWrap) {
        // Canvas needs real mirrored pixels (sharp) — assemble on the server,
        // which stores the PDF and returns a download URL.
        const res = await fetch("/api/workshop-board/layout-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            materialLabel: group.label,
            printableWidthCm,
            totalAlongCm: result.totalAlongCm,
            placements: result.placements,
            tiles: tileFileEntries,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
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

      const { buildRollLayoutPdfInBrowser } = await import(
        "@/lib/largeFormat/buildRollLayoutPdfClient"
      );
      const pdfBytes = await buildRollLayoutPdfInBrowser({
        printableWidthCm,
        totalAlongCm: result.totalAlongCm,
        placements: result.placements,
        tiles: tileFileEntries,
        fileNamesById,
        borderCmByTileId,
      });
      const safeLabel = group.label
        .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
        .replace(/-+/g, "-")
        .slice(0, 60);
      const fileName = `layout-${safeLabel || "roll"}-${new Date().toISOString().slice(0, 10)}.pdf`;
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
    usesGalleryWrap,
    group.label,
    printableWidthCm,
    result.totalAlongCm,
    result.placements,
    tileFileEntries,
    fileNamesById,
    borderCmByTileId,
    wb.layoutPdfError,
  ]);

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
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">
              {wb.layoutModalTitle(group.label)}
            </h2>
            <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-gray-500">
              {printableWidthCm > 0 && (
                <span>{wb.layoutPrintableWidth(printableWidthCm)}</span>
              )}
              <span>{wb.layoutGap(GROUP_TILE_PACK_DEFAULT_GAP_CM)}</span>
              <span>{wb.layoutTilesCount(tiles.length)}</span>
              {layoutBorderCm > 0 && (
                <span className="font-medium text-sky-600">
                  {wb.layoutWhiteBorder(layoutBorderCm)}
                </span>
              )}
              {layoutGalleryWrapCm > 0 && (
                <span className="font-medium text-emerald-600">
                  {wb.layoutGalleryWrap(layoutGalleryWrapCm)}
                </span>
              )}
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
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6 lg:flex-row">
          {/* SVG preview */}
          <div className="min-w-0 flex-1">
            {tiles.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
                Нет макетов для раскладки
              </div>
            ) : (
              <LayoutSvgPreview
                result={result}
                tiles={tiles}
                rollWidthCm={rollWidthCm}
              />
            )}
          </div>

          {/* Metrics panel */}
          <div className="flex w-full shrink-0 flex-col gap-3 lg:w-56">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
              <MetricRow
                label={wb.layoutCurrentLength(currentM)}
                highlight={false}
              />
              <MetricRow
                label={wb.layoutNaiveLength(naiveM)}
                highlight={false}
              />
              {savedM > 0 && (
                <MetricRow
                  label={wb.layoutSaved(savedM, savedPct)}
                  highlight
                />
              )}
            </div>

            {/* Unplaced tiles warning */}
            {result.unplacedTileIds.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{wb.layoutUnplaced(result.unplacedTileIds.length)}</span>
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!canDownloadPdf || pdfLoading}
              title={
                result.unplacedTileIds.length > 0
                  ? wb.layoutPdfUnplacedBlocked
                  : undefined
              }
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              {pdfLoading ? wb.layoutGeneratingPdf : wb.layoutDownloadPdf}
            </button>
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

// ─── Small metric row ─────────────────────────────────────────────────────────

function MetricRow({ label, highlight }: { label: string; highlight: boolean }) {
  return (
    <p
      className={
        highlight
          ? "text-[13px] font-semibold text-emerald-700"
          : "text-[12px] text-gray-600"
      }
    >
      {label}
    </p>
  );
}
