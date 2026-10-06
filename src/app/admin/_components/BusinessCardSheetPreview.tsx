"use client";

import type { BusinessCardSheetLayout } from "@/lib/businessCard/businessCardSheetLayout";

/**
 * Scale diagram of the imposition sheet: the sheet outline plus every card slot
 * in its grid position, so the customer and the workshop see the same thing the
 * generated PDF will contain.
 */
export function BusinessCardSheetPreview(props: {
  title: string;
  emptyHint: string;
  layout: BusinessCardSheetLayout | null;
}) {
  const layout = props.layout;
  const drawable =
    layout != null &&
    layout.cardsPerSheet > 0 &&
    layout.sheetWidthCm > 0 &&
    layout.sheetHeightCm > 0;

  return (
    <div className="mt-2">
      <p className="mb-1 text-[10px] font-medium text-gray-600">{props.title}</p>
      <div className="flex h-44 w-full items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white px-2 py-1.5">
        {drawable ? (
          <SheetSvg layout={layout} title={props.title} />
        ) : (
          <p className="px-2 text-center text-[10px] leading-snug text-gray-500">
            {props.emptyHint}
          </p>
        )}
      </div>
    </div>
  );
}

function SheetSvg({
  layout,
  title,
}: {
  layout: BusinessCardSheetLayout;
  title: string;
}) {
  const W = layout.sheetWidthCm;
  const H = layout.sheetHeightCm;
  const sheetStroke = Math.max(0.08, W / 500);
  const cardStroke = Math.max(0.05, W / 900);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title}
    >
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        fill="#fafafa"
        stroke="#d1d5db"
        strokeWidth={sheetStroke}
      />
      {layout.placements.map((p) => (
        <rect
          key={p.tileId}
          x={p.xCm}
          y={p.yCm}
          width={p.widthCm}
          height={p.heightCm}
          fill="rgba(251, 191, 36, 0.33)"
          stroke="#9ca3af"
          strokeWidth={cardStroke}
        />
      ))}
    </svg>
  );
}
