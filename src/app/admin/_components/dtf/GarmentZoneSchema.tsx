import type { DtfPlacement } from "@/lib/dtf/dtfConstants";
import { Shapes } from "lucide-react";
import { dtfZoneShape, type GarmentView } from "@/lib/dtf/dtfZones";
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
  view,
  muted = false,
  className,
}: {
  placement: DtfPlacement | null;
  /** Defaults to the zone's own view (front for «other»). */
  view?: GarmentView;
  /** Zone drawn grey: another row of the line prints there. */
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

/**
 * Picture of a saved zone: the T-shirt with the zone, or — for an «other»
 * zone described by a note (shorts, socks, a curtain) — a plain shapes icon.
 */
export function DtfZoneIcon({
  placement,
  placementNote,
  className,
}: {
  placement: DtfPlacement;
  placementNote?: string | null;
  className?: string;
}) {
  if (placement === "other" && placementNote?.trim()) {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center text-gray-400", className)} aria-hidden>
        <Shapes className="h-1/2 w-1/2" />
      </span>
    );
  }
  return <GarmentZoneSchema placement={placement} className={className} />;
}
