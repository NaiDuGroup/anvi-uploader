/**
 * Shelf-packing (First-Fit Decreasing Height) for a group of LF tiles.
 *
 * Each tile can be rotated 90° if it improves the fit. The algorithm adds a
 * configurable `gapCm` margin around every tile (inflated coordinates are used
 * for placement math; the actual rect drawn in the SVG is inset by `gapCm`
 * from each edge of the inflated slot).
 *
 * Complexity: O(n²) worst-case — fine for n ≤ ~200 tiles in production.
 */

const EPS = 1e-6;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GroupShelfPackTile {
  /** Unique identifier (e.g. `"${orderLineId}::${copyIdx}"`). */
  id: string;
  /** Human-readable label rendered inside the SVG rect (e.g. `"#2806 (1/3)"`). */
  label: string;
  widthCm: number;
  heightCm: number;
  /**
   * Whether the algorithm may swap width ↔ height.
   * Always true in practice — kept explicit for testability.
   */
  allowRotate: boolean;
}

export interface GroupShelfPackPlacement {
  tileId: string;
  label: string;
  /** X of the *inner* (actual print) rect — already accounts for gap. */
  xCm: number;
  /** Y of the *inner* (actual print) rect. */
  yCm: number;
  /** Final width after optional rotation (without gap). */
  widthCm: number;
  /** Final height after optional rotation (without gap). */
  heightCm: number;
  rotated: boolean;
}

export interface GroupShelfPackResult {
  placements: GroupShelfPackPlacement[];
  /** Total roll length consumed (cm). `= sum of shelf heights`. */
  totalAlongCm: number;
  printableWidthCm: number;
  gapCm: number;
  /** Tiles that didn't fit in any orientation within `printableWidthCm`. */
  unplacedTileIds: string[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface ResolvedTile {
  tile: GroupShelfPackTile;
  /** Width chosen (cross-roll) including gap on both sides. */
  inflatedW: number;
  /** Height chosen (along-roll) including gap on both sides. */
  inflatedH: number;
  /** True if w/h were swapped vs original. */
  rotated: boolean;
}

/**
 * Choose orientation for a tile given available shelf height and printable width.
 * Prefers orientation that fits shelf height; falls back to any orientation
 * that fits within printable width. Returns null if nothing fits.
 */
function chooseTileOrientation(
  tile: GroupShelfPackTile,
  printableWidthCm: number,
  gapCm: number,
  maxAlongCm: number, // remaining height in current shelf (Infinity if new shelf)
): ResolvedTile | null {
  // Each tile slot is inflated by gapCm (gapCm/2 on each side).
  // This gives exactly gapCm spacing between adjacent tiles.
  const g = gapCm;
  const w = tile.widthCm;
  const h = tile.heightCm;

  const candidates: { rotated: boolean; iw: number; ih: number }[] = [];

  // Natural orientation
  if (w + g <= printableWidthCm + EPS) {
    candidates.push({ rotated: false, iw: w + g, ih: h + g });
  }
  // Rotated orientation (only if different from natural)
  if (tile.allowRotate && Math.abs(w - h) > EPS && h + g <= printableWidthCm + EPS) {
    candidates.push({ rotated: true, iw: h + g, ih: w + g });
  }

  if (candidates.length === 0) return null;

  // Prefer one that fits in current shelf height (to avoid extending shelf)
  const fitsShelf = candidates.filter((c) => c.ih <= maxAlongCm + EPS);
  const chosen = fitsShelf.length > 0 ? fitsShelf[0]! : candidates[0]!;

  return { tile, inflatedW: chosen.iw, inflatedH: chosen.ih, rotated: chosen.rotated };
}

// ─── Main algorithm ───────────────────────────────────────────────────────────

/**
 * Pack `tiles` onto a roll of width `printableWidthCm`, with `gapCm` margin
 * around each tile. Tiles are sorted largest-first (FFDH) before packing.
 */
export function packGroupShelfFFDH(
  tiles: GroupShelfPackTile[],
  printableWidthCm: number,
  gapCm: number,
): GroupShelfPackResult {
  if (tiles.length === 0) {
    return {
      placements: [],
      totalAlongCm: 0,
      printableWidthCm,
      gapCm,
      unplacedTileIds: [],
    };
  }

  // Sort by descending max(w, h) — largest tiles first
  const sorted = [...tiles].sort(
    (a, b) => Math.max(b.widthCm, b.heightCm) - Math.max(a.widthCm, a.heightCm),
  );

  const placements: GroupShelfPackPlacement[] = [];
  const unplacedTileIds: string[] = [];

  // Shelf state
  type Shelf = { yCm: number; heightCm: number; usedWidthCm: number };
  const shelves: Shelf[] = [];
  let totalAlongCm = 0;

  for (const tile of sorted) {
    let placed = false;

    // Try existing shelves (first-fit)
    for (const shelf of shelves) {
      const remainingW = printableWidthCm - shelf.usedWidthCm;
      const resolved = chooseTileOrientation(
        tile,
        printableWidthCm,
        gapCm,
        shelf.heightCm,
      );
      if (!resolved) continue;
      if (resolved.inflatedW > remainingW + EPS) continue;

      // Place on this shelf — inner rect is offset by gapCm/2 from slot origin
      const innerX = shelf.usedWidthCm + gapCm / 2;
      const innerY = shelf.yCm + gapCm / 2;
      placements.push({
        tileId: tile.id,
        label: tile.label,
        xCm: innerX,
        yCm: innerY,
        widthCm: resolved.rotated ? tile.heightCm : tile.widthCm,
        heightCm: resolved.rotated ? tile.widthCm : tile.heightCm,
        rotated: resolved.rotated,
      });
      shelf.usedWidthCm += resolved.inflatedW;
      placed = true;
      break;
    }

    if (!placed) {
      // Open new shelf
      const resolved = chooseTileOrientation(
        tile,
        printableWidthCm,
        gapCm,
        Infinity,
      );
      if (!resolved) {
        unplacedTileIds.push(tile.id);
        continue;
      }

      const shelfY = totalAlongCm;
      const newShelf: Shelf = {
        yCm: shelfY,
        heightCm: resolved.inflatedH,
        usedWidthCm: resolved.inflatedW,
      };
      shelves.push(newShelf);
      totalAlongCm += resolved.inflatedH;

      const innerX = gapCm / 2;
      const innerY = shelfY + gapCm / 2;
      placements.push({
        tileId: tile.id,
        label: tile.label,
        xCm: innerX,
        yCm: innerY,
        widthCm: resolved.rotated ? tile.heightCm : tile.widthCm,
        heightCm: resolved.rotated ? tile.widthCm : tile.heightCm,
        rotated: resolved.rotated,
      });
    }
  }

  return {
    placements,
    totalAlongCm,
    printableWidthCm,
    gapCm,
    unplacedTileIds,
  };
}

/** Default gap between tiles on the roll (cm). */
export const GROUP_SHELF_PACK_DEFAULT_GAP_CM = 5;
