import type { DtfPlacement, GarmentKind } from "@/lib/dtf/dtfConstants";
import type { DtfPresetOption } from "@/lib/dtf/dtfLineCalc";
import { garmentKindForCategoryCode } from "@/lib/stock/unified/garmentTiers";

export type GarmentView = "front" | "back";

/**
 * Zone rectangle in a 100×100 view of the garment, as the viewer sees it:
 * the wearer's left chest / sleeve sits on the viewer's right of the front view.
 */
export interface DtfZoneShape {
  view: GarmentView;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees around the rectangle centre (sleeves). */
  rotate?: number;
}

export const DTF_ZONE_SHAPES: Record<Exclude<DtfPlacement, "other">, DtfZoneShape> = {
  front: { view: "front", x: 31, y: 20, w: 38, h: 53 },
  front_mid: { view: "front", x: 37, y: 20, w: 26, h: 37 },
  chest_center: { view: "front", x: 44, y: 17, w: 12, h: 11 },
  chest_across: { view: "front", x: 31, y: 19, w: 38, h: 8 },
  chest_left: { view: "front", x: 56, y: 19, w: 12, h: 11 },
  chest_right: { view: "front", x: 32, y: 19, w: 12, h: 11 },
  sleeve_left: { view: "front", x: 82, y: 21.5, w: 9, h: 8, rotate: 42 },
  sleeve_right: { view: "front", x: 9, y: 21.5, w: 9, h: 8, rotate: -42 },
  back: { view: "back", x: 31, y: 16, w: 38, h: 53 },
  back_mid: { view: "back", x: 37, y: 16, w: 26, h: 37 },
  nape: { view: "back", x: 44, y: 9, w: 12, h: 6 },
};

export function dtfZoneShape(placement: DtfPlacement): DtfZoneShape | null {
  return placement === "other" ? null : DTF_ZONE_SHAPES[placement];
}

/** Families with no front / back / sleeves to print on: their zone is «other» plus a note. */
const NON_TOP_KINDS: ReadonlySet<GarmentKind> = new Set<GarmentKind>(["cap", "socks", "bag", "underwear"]);

/**
 * Whether a garment takes the T-shirt zones. False only for a stock item
 * that clearly isn't a top (caps, socks, bags, underwear — by its kind or its
 * category code); client garments and unknown kinds keep the T-shirt.
 */
export function dtfGarmentTakesShirtZones(
  garment: { kind: GarmentKind; categoryCode?: string | null } | null | undefined,
): boolean {
  if (!garment) return true;
  const kind: GarmentKind =
    garment.kind === "other" && garment.categoryCode ? garmentKindForCategoryCode(garment.categoryCode) : garment.kind;
  return !NON_TOP_KINDS.has(kind);
}

/** Place shown for a zone: «Другое место: левая штанина» when an «other» zone has a note. */
export function dtfZoneLabel(
  zone: { placement: DtfPlacement; placementNote?: string | null },
  placements: Record<DtfPlacement, string>,
): string {
  const note: string = zone.placement === "other" ? (zone.placementNote ?? "").trim() : "";
  return note ? `${placements.other}: ${note}` : placements[zone.placement];
}

function overlaps(a: DtfZoneShape, b: DtfZoneShape): boolean {
  return a.view === b.view && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Order «add zone» tries: the usual second print after a front one first. */
const ADD_ZONE_ORDER: readonly DtfPlacement[] = [
  "front_mid",
  "back",
  "chest_left",
  "sleeve_left",
  "sleeve_right",
  "nape",
  "chest_right",
  "back_mid",
  "front",
  "chest_center",
  "chest_across",
];

/** Next zone for a new row: unused and clear of the used ones, else just unused, else «other». */
export function nextDtfPlacement(used: readonly DtfPlacement[]): DtfPlacement {
  const usedShapes = used.map(dtfZoneShape).filter((s): s is DtfZoneShape => s != null);
  const free = ADD_ZONE_ORDER.filter((p) => !used.includes(p));
  const clear = free.find((p) => {
    const shape = dtfZoneShape(p);
    return shape != null && !usedShapes.some((s) => overlaps(s, shape));
  });
  return clear ?? free[0] ?? "other";
}

/** Typical print size of a zone (cm, either orientation); none for «other». */
const ZONE_PRINT_CM: Record<Exclude<DtfPlacement, "other">, readonly [number, number]> = {
  front: [30, 42],
  front_mid: [21, 30],
  chest_center: [10, 10],
  chest_across: [28, 8],
  chest_left: [10, 10],
  chest_right: [10, 10],
  sleeve_left: [8, 8],
  sleeve_right: [8, 8],
  back: [30, 42],
  back_mid: [21, 30],
  nape: [9, 6],
};

/** Each side within 2× of the zone's typical size, proportions within 1.6×. */
const MAX_SIDE_LOG = Math.log(2) + 1e-9;
const MAX_ASPECT_LOG = Math.log(1.6) + 1e-9;

/**
 * Price list format closest in size to the zone's typical print, or null when
 * none is close (a wide chest strip with only A-formats in the list).
 */
export function suggestDtfPresetForPlacement<P extends DtfPresetOption>(
  placement: DtfPlacement,
  presets: readonly P[],
): P | null {
  if (placement === "other") return null;
  const [tw, th] = ZONE_PRINT_CM[placement];
  const tShort = Math.min(tw, th);
  const tLong = Math.max(tw, th);
  let best: P | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const p of presets) {
    const short = Math.min(p.widthCm, p.heightCm);
    const long = Math.max(p.widthCm, p.heightCm);
    if (short <= 0) continue;
    const dShort = Math.abs(Math.log(short / tShort));
    const dLong = Math.abs(Math.log(long / tLong));
    const dAspect = Math.abs(Math.log(long / short / (tLong / tShort)));
    if (dShort > MAX_SIDE_LOG || dLong > MAX_SIDE_LOG || dAspect > MAX_ASPECT_LOG) continue;
    const score = dShort + dLong;
    if (score < bestScore - 1e-9) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}
