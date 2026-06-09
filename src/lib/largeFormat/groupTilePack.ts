/**
 * 2-D strip packer for a group of large-format tiles.
 *
 * Replacement for the previous Shelf-FFDH algorithm. The earlier shelf approach
 * left large dead zones below short tiles whenever they shared a shelf with a
 * tall one (e.g. one long 250×21 banner next to a 60×45 sheet on the same
 * roll). This skyline / bottom-left-fill packer backfills that wasted space.
 *
 * Algorithm:
 *   1. Sort tiles by N different heuristics (max-dim, area, height, …).
 *   2. For each ordering, run a Bottom-Left-Fill skyline packer:
 *        - Maintain `[xStart, xEnd, height]` skyline segments over the strip.
 *        - For each tile try both orientations; pick the placement with the
 *          lowest final-Y, breaking ties by smallest sub-tile waste, then
 *          leftmost X.
 *   3. Return the best result across all orderings (least unplaced tiles,
 *      then shortest `totalAlongCm`).
 *
 * Coordinate convention (kept compatible with the previous module):
 *   - Tiles are inflated by `gapCm` on the long axis and the cross-roll axis;
 *     the *inner* placement returned in `xCm` / `yCm` is offset by `gapCm/2`
 *     so adjacent inner rects sit `gapCm` apart and rects on the strip edge
 *     have `gapCm/2` margin to the roll boundary.
 *
 * Complexity: O(S · n²) for S sort strategies and n tiles. Fine for the
 * production cap of ~200 tiles per group.
 */

const EPS = 1e-6;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GroupTilePackTile {
  /** Unique identifier (e.g. `"${orderLineId}::${copyIdx}"`). */
  id: string;
  /** Human-readable label rendered inside the SVG rect (e.g. `"#2806 (1/3)"`). */
  label: string;
  widthCm: number;
  heightCm: number;
  /** Whether the packer may swap width ↔ height. */
  allowRotate: boolean;
}

export interface GroupTilePackPlacement {
  tileId: string;
  label: string;
  /** X of the *inner* (actual print) rect — already accounts for `gapCm/2`. */
  xCm: number;
  /** Y of the *inner* (actual print) rect — already accounts for `gapCm/2`. */
  yCm: number;
  /** Final width after optional rotation (without gap). */
  widthCm: number;
  /** Final height after optional rotation (without gap). */
  heightCm: number;
  rotated: boolean;
}

export interface GroupTilePackResult {
  placements: GroupTilePackPlacement[];
  /** Total roll length consumed (cm); equals max skyline height. */
  totalAlongCm: number;
  printableWidthCm: number;
  gapCm: number;
  /** Tiles that didn't fit in any orientation within `printableWidthCm`. */
  unplacedTileIds: string[];
}

// ─── Skyline state ────────────────────────────────────────────────────────────

interface SkylineNode {
  xStart: number;
  xEnd: number;
  height: number;
}

function rangeMaxHeight(
  skyline: readonly SkylineNode[],
  xStart: number,
  xEnd: number,
): number {
  let max = 0;
  for (const n of skyline) {
    if (n.xEnd <= xStart + EPS) continue;
    if (n.xStart >= xEnd - EPS) break;
    if (n.height > max) max = n.height;
  }
  return max;
}

function rangeWaste(
  skyline: readonly SkylineNode[],
  xStart: number,
  xEnd: number,
  placeY: number,
): number {
  let waste = 0;
  for (const n of skyline) {
    if (n.xEnd <= xStart + EPS) continue;
    if (n.xStart >= xEnd - EPS) break;
    const overlap = Math.min(n.xEnd, xEnd) - Math.max(n.xStart, xStart);
    if (overlap > 0) waste += overlap * (placeY - n.height);
  }
  return waste;
}

function updateSkyline(
  skyline: SkylineNode[],
  xStart: number,
  xEnd: number,
  newHeight: number,
): void {
  const next: SkylineNode[] = [];
  let inserted = false;
  for (const n of skyline) {
    if (n.xEnd <= xStart + EPS) {
      next.push(n);
      continue;
    }
    if (n.xStart >= xEnd - EPS) {
      if (!inserted) {
        next.push({ xStart, xEnd, height: newHeight });
        inserted = true;
      }
      next.push(n);
      continue;
    }
    if (n.xStart < xStart - EPS) {
      next.push({ xStart: n.xStart, xEnd: xStart, height: n.height });
    }
    if (!inserted) {
      next.push({ xStart, xEnd, height: newHeight });
      inserted = true;
    }
    if (n.xEnd > xEnd + EPS) {
      next.push({ xStart: xEnd, xEnd: n.xEnd, height: n.height });
    }
  }
  if (!inserted) next.push({ xStart, xEnd, height: newHeight });

  skyline.length = 0;
  for (const seg of next) {
    const last = skyline[skyline.length - 1];
    if (
      last &&
      Math.abs(last.height - seg.height) < EPS &&
      Math.abs(last.xEnd - seg.xStart) < EPS
    ) {
      last.xEnd = seg.xEnd;
    } else {
      skyline.push({ ...seg });
    }
  }
}

// ─── Orientation candidates ───────────────────────────────────────────────────

interface CandidateOrientation {
  rotated: boolean;
  /** Inflated (slot) width = bare width + gap. */
  iw: number;
  /** Inflated (slot) height = bare height + gap. */
  ih: number;
  /** Bare width (after rotation). */
  w: number;
  /** Bare height (after rotation). */
  h: number;
}

function orientationCandidates(
  tile: GroupTilePackTile,
  gapCm: number,
  printableWidthCm: number,
): CandidateOrientation[] {
  const list: CandidateOrientation[] = [];
  if (tile.widthCm + gapCm <= printableWidthCm + EPS) {
    list.push({
      rotated: false,
      iw: tile.widthCm + gapCm,
      ih: tile.heightCm + gapCm,
      w: tile.widthCm,
      h: tile.heightCm,
    });
  }
  if (
    tile.allowRotate &&
    Math.abs(tile.widthCm - tile.heightCm) > EPS &&
    tile.heightCm + gapCm <= printableWidthCm + EPS
  ) {
    list.push({
      rotated: true,
      iw: tile.heightCm + gapCm,
      ih: tile.widthCm + gapCm,
      w: tile.heightCm,
      h: tile.widthCm,
    });
  }
  return list;
}

interface PlacementChoice {
  x: number;
  y: number;
  cand: CandidateOrientation;
  waste: number;
}

/**
 * Pure-greedy rotation policies tried by the driver. Greedy alone can lock the
 * first tile into the locally-shortest orientation (e.g. rotating a 40×60 to
 * a 60×40 strip, hogging the strip width) even when a different orientation
 * lets future tiles fit alongside. Running multiple forced policies and
 * keeping the best result side-steps that without expensive look-ahead.
 */
type OrientationPolicy = "greedy" | "natural-first" | "rotated-first";

function filterCandidatesByPolicy(
  cands: readonly CandidateOrientation[],
  policy: OrientationPolicy,
): readonly CandidateOrientation[] {
  if (cands.length <= 1 || policy === "greedy") return cands;
  if (policy === "natural-first") {
    const natural = cands.find((c) => !c.rotated);
    return natural ? [natural] : cands;
  }
  const rotated = cands.find((c) => c.rotated);
  return rotated ? [rotated] : cands;
}

function bestPlacementFor(
  tile: GroupTilePackTile,
  skyline: readonly SkylineNode[],
  gapCm: number,
  printableWidthCm: number,
  policy: OrientationPolicy,
): PlacementChoice | null {
  const cands = filterCandidatesByPolicy(
    orientationCandidates(tile, gapCm, printableWidthCm),
    policy,
  );
  if (cands.length === 0) return null;

  let best: PlacementChoice | null = null;
  for (const cand of cands) {
    for (const anchor of skyline) {
      const x = anchor.xStart;
      if (x + cand.iw > printableWidthCm + EPS) continue;
      const y = rangeMaxHeight(skyline, x, x + cand.iw);
      const waste = rangeWaste(skyline, x, x + cand.iw, y);
      const finalY = y + cand.ih;

      const isBetter = (() => {
        if (best == null) return true;
        const bestFinalY = best.y + best.cand.ih;
        if (finalY < bestFinalY - EPS) return true;
        if (finalY > bestFinalY + EPS) return false;
        if (waste < best.waste - EPS) return true;
        if (waste > best.waste + EPS) return false;
        return x < best.x - EPS;
      })();

      if (isBetter) best = { x, y, cand, waste };
    }
  }
  return best;
}

// ─── Single pass ──────────────────────────────────────────────────────────────

function packOnce(
  tiles: readonly GroupTilePackTile[],
  printableWidthCm: number,
  gapCm: number,
  policy: OrientationPolicy,
): GroupTilePackResult {
  const skyline: SkylineNode[] = [
    { xStart: 0, xEnd: printableWidthCm, height: 0 },
  ];
  const placements: GroupTilePackPlacement[] = [];
  const unplacedTileIds: string[] = [];
  let totalAlongCm = 0;

  for (const tile of tiles) {
    const best = bestPlacementFor(tile, skyline, gapCm, printableWidthCm, policy);
    if (!best) {
      unplacedTileIds.push(tile.id);
      continue;
    }
    const innerX = best.x + gapCm / 2;
    const innerY = best.y + gapCm / 2;
    placements.push({
      tileId: tile.id,
      label: tile.label,
      xCm: innerX,
      yCm: innerY,
      widthCm: best.cand.w,
      heightCm: best.cand.h,
      rotated: best.cand.rotated,
    });
    updateSkyline(
      skyline,
      best.x,
      best.x + best.cand.iw,
      best.y + best.cand.ih,
    );
    const finalY = best.y + best.cand.ih;
    if (finalY > totalAlongCm) totalAlongCm = finalY;
  }

  return {
    placements,
    totalAlongCm,
    printableWidthCm,
    gapCm,
    unplacedTileIds,
  };
}

// ─── Best-of-N driver ─────────────────────────────────────────────────────────

type SortKey = (tile: GroupTilePackTile) => number;

/**
 * Multiple ordering heuristics — each is evaluated and the best result wins.
 * Keeping the set small (<10) bounds runtime at O(S · n²).
 */
const SORT_STRATEGIES: ReadonlyArray<{ name: string; key: SortKey }> = [
  { name: "max-dim-desc", key: (t) => Math.max(t.widthCm, t.heightCm) },
  { name: "height-desc", key: (t) => t.heightCm },
  { name: "width-desc", key: (t) => t.widthCm },
  { name: "area-desc", key: (t) => t.widthCm * t.heightCm },
  { name: "perimeter-desc", key: (t) => t.widthCm + t.heightCm },
];

const ORIENTATION_POLICIES: readonly OrientationPolicy[] = [
  "greedy",
  "natural-first",
  "rotated-first",
];

function isStrictlyBetter(
  candidate: GroupTilePackResult,
  current: GroupTilePackResult,
): boolean {
  if (candidate.unplacedTileIds.length < current.unplacedTileIds.length) return true;
  if (candidate.unplacedTileIds.length > current.unplacedTileIds.length) return false;
  return candidate.totalAlongCm < current.totalAlongCm - EPS;
}

/**
 * Pack `tiles` onto a roll strip of width `printableWidthCm`, with `gapCm`
 * margin around every tile. Picks the best result across S sort orderings ×
 * P rotation policies, returning the layout that minimises unplaced tiles
 * first and total roll length second.
 */
export function packGroupTiles(
  tiles: readonly GroupTilePackTile[],
  printableWidthCm: number,
  gapCm: number,
): GroupTilePackResult {
  if (tiles.length === 0) {
    return {
      placements: [],
      totalAlongCm: 0,
      printableWidthCm,
      gapCm,
      unplacedTileIds: [],
    };
  }

  let best: GroupTilePackResult | null = null;
  for (const strat of SORT_STRATEGIES) {
    const sorted = [...tiles].sort((a, b) => {
      const diff = strat.key(b) - strat.key(a);
      if (Math.abs(diff) > EPS) return diff;
      const aDim = Math.max(a.widthCm, a.heightCm);
      const bDim = Math.max(b.widthCm, b.heightCm);
      if (Math.abs(bDim - aDim) > EPS) return bDim - aDim;
      return a.id.localeCompare(b.id);
    });
    for (const policy of ORIENTATION_POLICIES) {
      const result = packOnce(sorted, printableWidthCm, gapCm, policy);
      if (best == null || isStrictlyBetter(result, best)) best = result;
    }
  }
  return best!;
}

/** Default gap between tiles on the roll (cm). */
export const GROUP_TILE_PACK_DEFAULT_GAP_CM = 1;
