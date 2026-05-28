"use client";

import React, { useMemo, useRef } from "react";
import { X, AlertTriangle } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { resolveEffectivePrintableWidthMeters } from "@/lib/largeFormat/largeFormatRollConstants";
import {
  packGroupShelfFFDH,
  GROUP_SHELF_PACK_DEFAULT_GAP_CM,
  type GroupShelfPackTile,
  type GroupShelfPackResult,
} from "@/lib/largeFormat/groupShelfPack";
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

interface PreparedTile extends GroupShelfPackTile {
  colorIdx: number;
}

function prepareTiles(lines: WorkshopBoardLine[]): PreparedTile[] {
  const tiles: PreparedTile[] = [];
  const orderNumbers = [...new Set(lines.map((l) => l.orderNumber))];
  const orderColorMap = new Map(orderNumbers.map((n, i) => [n, i % TILE_COLORS.length]));

  for (const line of lines) {
    if (line.facts.kind !== "lf") continue;
    const { widthCm, heightCm, quantity } = line.facts.data;
    const { orderNumber, orderLineId, lineIndex, totalLines } = line;
    const colorIdx = orderColorMap.get(orderNumber) ?? 0;

    for (let copy = 1; copy <= quantity; copy++) {
      const label = totalLines > 1
        ? `#${orderNumber}.${lineIndex}/${totalLines} (${copy}/${quantity})`
        : `#${orderNumber} (${copy}/${quantity})`;
      tiles.push({
        id: `${orderLineId}::${copy}`,
        label,
        widthCm,
        heightCm,
        allowRotate: true,
        colorIdx,
      });
    }
  }
  return tiles;
}

/**
 * Naïve total: what the algorithm would produce if ZERO tiles were packed
 * side-by-side (each tile on its own shelf). Uses the same gapCm inflation
 * as packGroupShelfFFDH, so savings ≥ 0 whenever any tiles share a shelf.
 */
function naiveLengthCm(
  tiles: PreparedTile[],
  printableWidthCm: number,
  gapCm: number,
): number {
  return tiles.reduce((sum, tile) => {
    let h = tile.heightCm;
    // Rotate only when natural orientation doesn't fit the roll width
    if (tile.widthCm + gapCm > printableWidthCm + 1e-6 && tile.allowRotate) {
      h = tile.widthCm;
    }
    return sum + h + gapCm;
  }, 0);
}

// ─── SVG preview ──────────────────────────────────────────────────────────────

const MIN_LABEL_WIDTH_CM = 8;
const SVG_SCALE = 3; // px per cm

interface LayoutSvgPreviewProps {
  result: GroupShelfPackResult;
  tiles: PreparedTile[];
}

function LayoutSvgPreview({ result, tiles }: LayoutSvgPreviewProps) {
  const { placements, printableWidthCm, totalAlongCm, gapCm } = result;
  const tileMap = useMemo(
    () => new Map(tiles.map((t) => [t.id, t])),
    [tiles],
  );

  const svgW = printableWidthCm * SVG_SCALE;
  const svgH = Math.max(totalAlongCm * SVG_SCALE, 40);

  return (
    <div className="relative overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
      <svg
        viewBox={`0 0 ${printableWidthCm} ${Math.max(totalAlongCm, 20)}`}
        width={svgW}
        height={svgH}
        style={{ display: "block", maxWidth: "100%" }}
        aria-label="Roll layout preview"
      >
        {/* Roll background */}
        <rect x={0} y={0} width={printableWidthCm} height={Math.max(totalAlongCm, 20)} fill="#f8fafc" />

        {/* Gap grid lines for visual reference (every shelf boundary) */}
        {placements.map((p) => {
          const tile = tileMap.get(p.tileId);
          const colorIdx = tile?.colorIdx ?? 0;
          const { fill, stroke, text } = TILE_COLORS[colorIdx % TILE_COLORS.length]!;
          const showLabel = p.widthCm >= MIN_LABEL_WIDTH_CM;

          return (
            <g key={p.tileId}>
              {/* Tile rect */}
              <rect
                x={p.xCm}
                y={p.yCm}
                width={p.widthCm}
                height={p.heightCm}
                fill={fill}
                stroke={stroke}
                strokeWidth={0.4}
                rx={0.5}
              />
              {showLabel && (
                <>
                  {/* Order ref */}
                  <text
                    x={p.xCm + p.widthCm / 2}
                    y={p.yCm + p.heightCm / 2 - 1}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fontSize={Math.min(2.8, p.heightCm * 0.28)}
                    fontFamily="system-ui, sans-serif"
                    fontWeight="600"
                    fill={text}
                    style={{ userSelect: "none" }}
                  >
                    {tile?.label ?? p.label}
                  </text>
                  {/* Size */}
                  <text
                    x={p.xCm + p.widthCm / 2}
                    y={p.yCm + p.heightCm / 2 + 1.5}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fontSize={Math.min(2, p.heightCm * 0.2)}
                    fontFamily="system-ui, sans-serif"
                    fill={text}
                    opacity={0.75}
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

        {/* Gap markers at gapCm from roll edges */}
        <line
          x1={0}
          y1={0}
          x2={printableWidthCm}
          y2={0}
          stroke="#94a3b8"
          strokeWidth={0.3}
          strokeDasharray="1 1"
        />
        <line
          x1={0}
          y1={Math.max(totalAlongCm, 20)}
          x2={printableWidthCm}
          y2={Math.max(totalAlongCm, 20)}
          stroke="#94a3b8"
          strokeWidth={0.3}
          strokeDasharray="1 1"
        />
        {/* Roll edge labels */}
        <text
          x={0.5}
          y={1.5}
          fontSize={1.8}
          fontFamily="system-ui, sans-serif"
          fill="#94a3b8"
          style={{ userSelect: "none" }}
        >
          {`${printableWidthCm} см`}
        </text>
        {totalAlongCm > 0 && (
          <text
            x={0.5}
            y={totalAlongCm - 0.3}
            fontSize={1.8}
            fontFamily="system-ui, sans-serif"
            fill="#94a3b8"
            style={{ userSelect: "none" }}
          >
            {`${(totalAlongCm / 100).toFixed(2)} м`}
          </text>
        )}
        {/* Gap annotation */}
        {gapCm > 0 && (
          <text
            x={printableWidthCm - 0.5}
            y={gapCm / 2 + 0.5}
            textAnchor="end"
            fontSize={1.6}
            fontFamily="system-ui, sans-serif"
            fill="#94a3b8"
            style={{ userSelect: "none" }}
          >
            {`↕ ${gapCm}см`}
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

  const printableWidthCm = useMemo(() => {
    const m = resolveEffectivePrintableWidthMeters({
      printableWidthMeters: group.meta.printableWidthMeters,
      rollWidthMeters: group.meta.rollWidthMeters ?? "0",
    });
    return Math.round(m * 100);
  }, [group.meta]);

  const tiles = useMemo(() => prepareTiles(group.lines), [group.lines]);

  const result = useMemo(
    () => packGroupShelfFFDH(tiles, printableWidthCm, GROUP_SHELF_PACK_DEFAULT_GAP_CM),
    [tiles, printableWidthCm],
  );

  const naiveCm = useMemo(
    () => naiveLengthCm(tiles, printableWidthCm, GROUP_SHELF_PACK_DEFAULT_GAP_CM),
    [tiles, printableWidthCm],
  );
  const naiveM = naiveCm / 100;
  const currentM = result.totalAlongCm / 100;
  const savedM = naiveM - currentM;
  const savedPct = naiveM > 0 ? (savedM / naiveM) * 100 : 0;

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
              <span>{wb.layoutGap(GROUP_SHELF_PACK_DEFAULT_GAP_CM)}</span>
              <span>{wb.layoutTilesCount(tiles.length)}</span>
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
              <LayoutSvgPreview result={result} tiles={tiles} />
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
        <div className="flex justify-end border-t border-gray-100 px-6 py-3">
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
