import type { ReactElement } from "react";
import type { StickerSheetPreviewData } from "@/lib/stickerSheet/stickerSheet";

/**
 * Sticker sheet to scale: the sheet, the 4 corner camera marks (black dot in a
 * yellow square, as Camera Cut draws them) and the sticker grid with its real
 * shapes, margins and gap. Optional artwork fills every sticker.
 */
export function StickerSheetPreview({
  data,
  imageUrl,
  className,
  maxHeightPx = 180,
}: {
  data: StickerSheetPreviewData;
  imageUrl?: string | null;
  className?: string;
  maxHeightPx?: number;
}): ReactElement {
  // Work in millimetres.
  const W = data.sheetWidthCm * 10;
  const H = data.sheetHeightCm * 10;
  const margin = Math.max(0, data.marginMm);
  const markSide = Math.max(4, Math.min(margin * 0.7, 9));
  const markOffset = Math.max(0.5, (margin - markSide) / 2);
  const slotW = data.slotWidthCm * 10;
  const slotH = data.slotHeightCm * 10;
  const gap = data.gapCm * 10;
  const x0 = data.marginXCm * 10;
  const y0 = data.marginYCm * 10;
  const clipId = `sticker-clip-${data.shape}-${Math.round(slotW * 10)}-${Math.round(slotH * 10)}`;
  const radius = data.shape === "rounded" ? Math.min(slotW, slotH) * 0.15 : data.shape === "contour" ? Math.min(slotW, slotH) * 0.3 : 0;

  const shapes: ReactElement[] = [];
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.columns; c++) {
      const x = x0 + c * (slotW + gap);
      const y = y0 + r * (slotH + gap);
      const key = `${r}-${c}`;
      const stroke = data.cut ? "#e11d48" : "#9ca3af";
      const common = { fill: imageUrl ? "none" : "#ecfccb", stroke, strokeWidth: 0.6 } as const;
      shapes.push(
        <g key={key}>
          {imageUrl ? (
            <image
              href={imageUrl}
              x={x}
              y={y}
              width={slotW}
              height={slotH}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${clipId}-${key})`}
            />
          ) : null}
          {data.shape === "circle" ? (
            <ellipse cx={x + slotW / 2} cy={y + slotH / 2} rx={slotW / 2} ry={slotH / 2} {...common} />
          ) : (
            <rect x={x} y={y} width={slotW} height={slotH} rx={radius} {...common} />
          )}
        </g>,
      );
    }
  }

  const clips: ReactElement[] = [];
  if (imageUrl) {
    for (let r = 0; r < data.rows; r++) {
      for (let c = 0; c < data.columns; c++) {
        const x = x0 + c * (slotW + gap);
        const y = y0 + r * (slotH + gap);
        clips.push(
          <clipPath key={`${r}-${c}`} id={`${clipId}-${r}-${c}`}>
            {data.shape === "circle" ? (
              <ellipse cx={x + slotW / 2} cy={y + slotH / 2} rx={slotW / 2} ry={slotH / 2} />
            ) : (
              <rect x={x} y={y} width={slotW} height={slotH} rx={radius} />
            )}
          </clipPath>,
        );
      }
    }
  }

  const marks = [
    [markOffset, markOffset],
    [W - markOffset - markSide, markOffset],
    [markOffset, H - markOffset - markSide],
    [W - markOffset - markSide, H - markOffset - markSide],
  ] as const;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={{ maxHeight: maxHeightPx, height: maxHeightPx, width: "auto" }}
      role="img"
      aria-label={`${data.format}: ${data.columns * data.rows}`}
    >
      {clips.length > 0 ? <defs>{clips}</defs> : null}
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" stroke="#6b7280" strokeWidth={1} />
      {margin > 0 ? (
        <rect
          x={margin}
          y={margin}
          width={W - 2 * margin}
          height={H - 2 * margin}
          fill="none"
          stroke="#d1d5db"
          strokeWidth={0.5}
          strokeDasharray="3 3"
        />
      ) : null}
      {shapes}
      {margin > 0
        ? marks.map(([mx, my], i) => (
            <g key={i}>
              <rect x={mx} y={my} width={markSide} height={markSide} fill="#facc15" />
              <circle cx={mx + markSide / 2} cy={my + markSide / 2} r={markSide * 0.28} fill="#111827" />
            </g>
          ))
        : null}
    </svg>
  );
}
