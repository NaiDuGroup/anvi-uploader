import type { DtfPlacement } from "@/lib/dtf/dtfConstants";
import { dtfZoneShape, type GarmentSilhouette, type GarmentView } from "@/lib/dtf/dtfZones";
import { cn } from "@/lib/utils";

/** Shoulders, sleeves and hem, open at the neck (100×100 view). */
const BODY = "M37 6 L20 11 L3 31 L14 42 L23 34 L23 96 L77 96 L77 34 L86 42 L97 31 L80 11 L63 6";
const NECK_FRONT = " C58 14 42 14 37 6 Z";
const NECK_BACK = " C58 10 42 10 37 6 Z";

/**
 * Read-only garment outline with one print zone highlighted (front or back
 * view, whichever holds the zone). The wearer's left is on the viewer's right.
 */
export function GarmentZoneSchema({
  placement,
  silhouette = "tshirt",
  view,
  muted = false,
  className,
}: {
  placement: DtfPlacement | null;
  silhouette?: GarmentSilhouette;
  /** Defaults to the zone's own view (front for «other»). */
  view?: GarmentView;
  /** Zone drawn grey: taken or unavailable. */
  muted?: boolean;
  className?: string;
}) {
  const shape = placement ? dtfZoneShape(placement) : null;
  const side: GarmentView = view ?? shape?.view ?? "front";
  const showZone = shape != null && shape.view === side;
  const outline = "fill-white stroke-gray-400";
  return (
    <svg viewBox="0 0 100 100" className={cn("shrink-0", className)} aria-hidden focusable="false">
      <path
        d={BODY + (side === "front" ? NECK_FRONT : NECK_BACK)}
        className={outline}
        strokeWidth={1}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {silhouette === "polo" &&
        (side === "front" ? (
          <>
            <path d="M37 6 L50 13 L41 18 Z M63 6 L50 13 L59 18 Z" className={outline} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <rect x={47.5} y={13} width={5} height={20} className={outline} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={50} cy={20} r={1.2} className="fill-gray-400" />
            <circle cx={50} cy={27} r={1.2} className="fill-gray-400" />
          </>
        ) : (
          <path d="M37 6 C42 12 58 12 63 6" className="fill-none stroke-gray-400" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      {showZone && (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rx={1.5}
          transform={
            shape.rotate ? `rotate(${shape.rotate} ${shape.x + shape.w / 2} ${shape.y + shape.h / 2})` : undefined
          }
          className={muted ? "fill-gray-300 stroke-gray-400" : "fill-fuchsia-500/70 stroke-fuchsia-700"}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {placement === "other" && (
        <text x={50} y={66} textAnchor="middle" fontSize={34} fontWeight={600} className="fill-gray-400">
          ?
        </text>
      )}
    </svg>
  );
}
