"use strict";

/**
 * Free-pack layout: shelf-packing (row-by-row) with ZERO gaps and a maximum
 * row width constraint. Pure math — no DOM, no canvas.
 *
 * Use-case: UV flatbed workflows where the operator wants to merge several
 * independently-rendered PNG tiles of *arbitrary* sizes onto one sheet to
 * save bed changes. The output has:
 *
 *   - No padding, no inter-tile gaps (tiles sit edge-to-edge).
 *   - Width capped by `maxWidthPx`. When adding the next tile would overflow,
 *     the current row is finalised and the tile starts a fresh row.
 *   - Row height = max(tile heights in that row). Shorter tiles sit flush
 *     against the row's top edge; the remainder stays transparent.
 *   - Canvas height = sum of row heights (strict row stacking).
 *
 * This is deliberately *not* an optimal 2D bin-packing — the operator picks
 * the drop order and can reorder tiles in the UI. We stay predictable: tile
 * N always lands after tile N-1 in reading order.
 *
 * Example (five A3 landscape tiles 3000×2000 px, maxWidth=7087 px):
 *
 *   row 0: [ T0 (0..3000) ] [ T1 (3000..6000) ]   width = 6000, height = 2000
 *   row 1: [ T2 (0..3000) ] [ T3 (3000..6000) ]   width = 6000, height = 2000
 *   row 2: [ T4 (0..3000) ]                        width = 3000, height = 2000
 *   canvas: 6000 × 6000 px (max row width × sum of row heights)
 */

// ─── Public constants ───────────────────────────────────────────────────────

/** Table-width ceiling. The operator can tile up to this many cm per row. */
export const FREEPACK_MAX_WIDTH_CM = 60;
/** Fewer than 2 tiles is pointless (just use the raw file). */
export const FREEPACK_MIN_FILES = 2;
/**
 * Upper bound for a single compose run. Keeps the browser canvas within
 * reasonable memory limits even if the operator drops a batch of huge files;
 * also protects the 10 MB upload cap on the history endpoint.
 */
export const FREEPACK_MAX_FILES = 20;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FreepackTileSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface FreepackSlot {
  /** Zero-based drop index (= position in the input `sizes` array). */
  readonly index: number;
  /** Zero-based row this slot lives in. */
  readonly row: number;
  /** Position of the tile *within* its row (0 = leftmost). */
  readonly colInRow: number;
  /** Slot origin in canvas pixels — tile is drawn at (offsetXPx, offsetYPx). */
  readonly offsetXPx: number;
  readonly offsetYPx: number;
  /** Original tile dimensions (always drawn 1:1, never resized). */
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface FreepackRow {
  /** Sum of tile widths in this row (always ≤ maxWidthPx). */
  readonly widthPx: number;
  /** Max of tile heights in this row — determines canvas Y step. */
  readonly heightPx: number;
  /** Y offset of this row's top edge inside the canvas. */
  readonly startY: number;
  /** How many tiles sit in this row. */
  readonly tileCount: number;
}

export interface FreepackLayout {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly rows: readonly FreepackRow[];
  readonly slots: readonly FreepackSlot[];
}

export interface ComputeFreepackLayoutInput {
  readonly sizes: readonly FreepackTileSize[];
  /** Hard cap on each row's width in pixels (= `cmToPx(60, dpi)` for UV bed). */
  readonly maxWidthPx: number;
}

// ─── Pure math ──────────────────────────────────────────────────────────────

/**
 * Pack `sizes` into shelves (rows) of width ≤ `maxWidthPx`. Order is strictly
 * preserved — the operator decides placement via drag-order and reorder
 * controls in the UI. Returns a layout descriptor you can hand straight to
 * the canvas composer *and* to a UI preview.
 *
 * Throws for invalid inputs (count out of range, non-integer count,
 * non-positive dimensions, tile wider than `maxWidthPx`) so the UI can turn
 * them into user-facing errors without silently emitting an empty canvas.
 */
export function computeFreepackLayout(
  input: ComputeFreepackLayoutInput,
): FreepackLayout {
  const { sizes, maxWidthPx } = input;

  if (!Number.isInteger(sizes.length)) {
    // Impossible via normal array length, but guards against synthetic inputs.
    throw new Error(`Tile count must be an integer, got ${sizes.length}`);
  }
  if (
    sizes.length < FREEPACK_MIN_FILES ||
    sizes.length > FREEPACK_MAX_FILES
  ) {
    throw new Error(
      `Tile count must be between ${FREEPACK_MIN_FILES} and ${FREEPACK_MAX_FILES}, got ${sizes.length}`,
    );
  }
  if (!(maxWidthPx > 0) || !Number.isFinite(maxWidthPx)) {
    throw new Error(`maxWidthPx must be positive, got ${maxWidthPx}`);
  }
  for (let i = 0; i < sizes.length; i += 1) {
    const s = sizes[i]!;
    if (!(s.widthPx > 0) || !(s.heightPx > 0)) {
      throw new Error(
        `Tile #${i} has non-positive dimensions ${s.widthPx}x${s.heightPx}`,
      );
    }
    if (s.widthPx > maxWidthPx) {
      throw new Error(
        `Tile #${i} is wider than max row width: ${s.widthPx}px > ${maxWidthPx}px`,
      );
    }
  }

  // Shelf-packing: walk left-to-right across the current row, flush & start a
  // new row when the next tile would overflow.
  const rows: FreepackRow[] = [];
  const slots: FreepackSlot[] = [];

  let currentWidth = 0;
  let currentHeight = 0;
  let currentCount = 0;
  let currentStartY = 0;
  let currentRowIndex = 0;

  const flush = (): void => {
    rows.push({
      widthPx: currentWidth,
      heightPx: currentHeight,
      startY: currentStartY,
      tileCount: currentCount,
    });
    // Advance to the next row baseline.
    currentStartY += currentHeight;
    currentWidth = 0;
    currentHeight = 0;
    currentCount = 0;
    currentRowIndex += 1;
  };

  for (let i = 0; i < sizes.length; i += 1) {
    const s = sizes[i]!;
    // If this tile would push us past maxWidth AND we already have at least
    // one tile in the current row, finalise the row and reset the cursor.
    // The `currentCount > 0` guard prevents an infinite flush for tiles that
    // *exactly* fit the row width (handled below by the natural overflow on
    // the following iteration).
    if (currentCount > 0 && currentWidth + s.widthPx > maxWidthPx) {
      flush();
    }

    slots.push({
      index: i,
      row: currentRowIndex,
      colInRow: currentCount,
      offsetXPx: currentWidth,
      offsetYPx: currentStartY,
      widthPx: s.widthPx,
      heightPx: s.heightPx,
    });
    currentWidth += s.widthPx;
    currentHeight = Math.max(currentHeight, s.heightPx);
    currentCount += 1;
  }

  // Flush the final (potentially partial) row — guaranteed non-empty because
  // sizes.length >= 2.
  if (currentCount > 0) flush();

  const canvasWidthPx = rows.reduce((max, r) => Math.max(max, r.widthPx), 0);
  const canvasHeightPx = rows.reduce((sum, r) => sum + r.heightPx, 0);

  return { canvasWidthPx, canvasHeightPx, rows, slots };
}

// ─── Helpers for the UI ─────────────────────────────────────────────────────

/**
 * `true` iff every tile has exactly the same (widthPx, heightPx) as the
 * first. Used for the "mixed sizes" soft warning in the UI: when the
 * operator drops a mix of sizes the output has ragged rows, so we surface
 * it as a non-blocking amber banner.
 *
 * Empty / single-tile inputs trivially have "all same size" semantics (and
 * the validator rejects them earlier anyway).
 */
export function freepackTilesAllSameSize(
  sizes: readonly FreepackTileSize[],
): boolean {
  if (sizes.length <= 1) return true;
  const first = sizes[0]!;
  for (let i = 1; i < sizes.length; i += 1) {
    const s = sizes[i]!;
    if (s.widthPx !== first.widthPx || s.heightPx !== first.heightPx) {
      return false;
    }
  }
  return true;
}

/**
 * Count unique (width × height) pairs. Used by the mixed-sizes warning so
 * the UI can say "3 unique sizes" instead of a vague "sizes differ".
 */
export function freepackUniqueSizeCount(
  sizes: readonly FreepackTileSize[],
): number {
  const seen = new Set<string>();
  for (const s of sizes) {
    seen.add(`${s.widthPx}x${s.heightPx}`);
  }
  return seen.size;
}
