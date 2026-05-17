"use client";

type Placement = {
  xCm: number;
  yCm: number;
  crossCm: number;
  alongCm: number;
  rotated: boolean;
};

/** Fixed-height diagram area — avoids SKU column height jumping when SVG appears/disappears. */
export function LfRollPackPreview(props: {
  title: string;
  /** Hint inside the diagram frame when packing is not yet calculated. */
  emptyHint: string;
  diagram?:
    | {
        printableWidthCm: number;
        totalAlongCm: number;
        placements: Placement[];
      }
    | undefined;
}) {
  const d = props.diagram;
  const drawable =
    d != null &&
    d.printableWidthCm > 0 &&
    d.totalAlongCm > 0 &&
    d.placements.length > 0;

  const svgBody = drawable ? (
    (() => {
      const W = d.printableWidthCm;
      const H = d.totalAlongCm;
      const strokeW = Math.max(0.15, W / 500);
      const innerStroke = Math.max(0.1, W / 700);
      const vb = `0 0 ${W} ${H}`;
      return (
        <svg
          viewBox={vb}
          className="h-full w-full max-h-36 shrink-0"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={props.title}
        >
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            fill="#fafafa"
            stroke="#d1d5db"
            strokeWidth={strokeW}
          />
          {d.placements.map((p, i) => (
            <rect
              key={i}
              x={p.xCm}
              y={p.yCm}
              width={p.crossCm}
              height={p.alongCm}
              fill="rgba(251, 191, 36, 0.33)"
              stroke="#d97706"
              strokeWidth={innerStroke}
            />
          ))}
        </svg>
      );
    })()
  ) : (
    <p className="px-2 text-center text-[10px] leading-snug text-gray-500">
      {props.emptyHint}
    </p>
  );

  return (
    <div className="mt-2">
      <p className="mb-1 text-[10px] font-medium text-gray-600">{props.title}</p>
      <div className="flex h-36 w-full items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white px-2">
        {svgBody}
      </div>
    </div>
  );
}
