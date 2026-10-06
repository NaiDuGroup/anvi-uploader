/**
 * Business card imposition: a uniform grid of identical cards centred on one
 * sheet. Deliberately not `packGroupTiles` (bottom-left-fill) — the workshop
 * cuts a guillotine grid, so rows and columns must line up exactly and the
 * block must sit centred, the way the operator builds it by hand.
 *
 * Standard case: 22.5 × 32 sheet + 9.4 × 5.4 card → the card is turned 90°
 * (5.4 across × 9.4 down) and 4 × 3 = 12 fit, versus 2 × 5 = 10 unturned.
 *
 * The grid is symmetric under horizontal mirroring (equal left/right margins,
 * uniform pitch), so the same layout registers on the reverse side of a duplex
 * sheet — no mirrored variant is needed.
 */

import type { GroupTilePackPlacement } from "@/lib/largeFormat/groupTilePack";

/** Floor tolerance so exact fits (e.g. 21.6 / 5.4) aren't lost to float error. */
const FIT_EPS = 1e-6;

export interface BusinessCardSheetLayoutInput {
  sheetWidthCm: number;
  sheetHeightCm: number;
  /** Nominal card size; the engine may turn it 90° to fit more per sheet. */
  cardWidthCm: number;
  cardHeightCm: number;
  /** Gap between neighbouring cards (cm). 0 = shared cut line. */
  gapCm?: number;
}

export interface BusinessCardSheetLayout {
  sheetWidthCm: number;
  sheetHeightCm: number;
  /** Card footprint after the orientation decision. */
  slotWidthCm: number;
  slotHeightCm: number;
  /** True when the card was turned 90° relative to the nominal size. */
  rotated: boolean;
  columns: number;
  rows: number;
  cardsPerSheet: number;
  gapCm: number;
  /** Centring offset of the printed block (cm). */
  marginXCm: number;
  marginYCm: number;
  /** Reading order: left to right, top to bottom. */
  placements: readonly GroupTilePackPlacement[];
}

function fitCount(availableCm: number, slotCm: number, gapCm: number): number {
  if (!(slotCm > 0) || !(availableCm > 0)) return 0;
  return Math.max(0, Math.floor((availableCm + gapCm + FIT_EPS) / (slotCm + gapCm)));
}

interface GridCandidate {
  rotated: boolean;
  slotWidthCm: number;
  slotHeightCm: number;
  columns: number;
  rows: number;
}

function gridCandidate(
  input: BusinessCardSheetLayoutInput,
  rotated: boolean,
  gapCm: number,
): GridCandidate {
  const slotWidthCm = rotated ? input.cardHeightCm : input.cardWidthCm;
  const slotHeightCm = rotated ? input.cardWidthCm : input.cardHeightCm;
  return {
    rotated,
    slotWidthCm,
    slotHeightCm,
    columns: fitCount(input.sheetWidthCm, slotWidthCm, gapCm),
    rows: fitCount(input.sheetHeightCm, slotHeightCm, gapCm),
  };
}

function candidateCount(candidate: GridCandidate): number {
  return candidate.columns * candidate.rows;
}

/**
 * Lay the card out on the sheet, picking the orientation that fits the most
 * cards. `cardsPerSheet === 0` means the card does not fit at all — callers
 * must treat that as a validation error.
 */
export function computeBusinessCardSheetLayout(
  input: BusinessCardSheetLayoutInput,
): BusinessCardSheetLayout {
  const gapCm = Math.max(0, input.gapCm ?? 0);

  const upright = gridCandidate(input, false, gapCm);
  const turned = gridCandidate(input, true, gapCm);
  // Ties keep the upright orientation so the result is stable and predictable.
  const best = candidateCount(turned) > candidateCount(upright) ? turned : upright;

  const { columns, rows, slotWidthCm, slotHeightCm } = best;
  const cardsPerSheet = columns * rows;

  if (cardsPerSheet === 0) {
    return {
      sheetWidthCm: input.sheetWidthCm,
      sheetHeightCm: input.sheetHeightCm,
      slotWidthCm,
      slotHeightCm,
      rotated: best.rotated,
      columns: 0,
      rows: 0,
      cardsPerSheet: 0,
      gapCm,
      marginXCm: 0,
      marginYCm: 0,
      placements: [],
    };
  }

  const blockWidthCm = columns * slotWidthCm + (columns - 1) * gapCm;
  const blockHeightCm = rows * slotHeightCm + (rows - 1) * gapCm;
  const marginXCm = (input.sheetWidthCm - blockWidthCm) / 2;
  const marginYCm = (input.sheetHeightCm - blockHeightCm) / 2;

  const placements: GroupTilePackPlacement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const index = row * columns + col + 1;
      placements.push({
        tileId: `card-${index}`,
        label: `${index}/${cardsPerSheet}`,
        xCm: marginXCm + col * (slotWidthCm + gapCm),
        yCm: marginYCm + row * (slotHeightCm + gapCm),
        widthCm: slotWidthCm,
        heightCm: slotHeightCm,
        rotated: best.rotated,
      });
    }
  }

  return {
    sheetWidthCm: input.sheetWidthCm,
    sheetHeightCm: input.sheetHeightCm,
    slotWidthCm,
    slotHeightCm,
    rotated: best.rotated,
    columns,
    rows,
    cardsPerSheet,
    gapCm,
    marginXCm,
    marginYCm,
    placements,
  };
}

/**
 * Rebuild the exact sheet layout an order was priced with, from the grid frozen
 * on the order line. Replaying the stored numbers (instead of recomputing) keeps
 * the workshop PDF identical even after the card standard or the engine changes.
 */
export function businessCardLayoutFromPersisted(persisted: {
  sheetWidthCm: number;
  sheetHeightCm: number;
  columns: number;
  rows: number;
  rotated: boolean;
  gapCm: number;
  marginXCm: number;
  marginYCm: number;
  slotWidthCm: number;
  slotHeightCm: number;
}): BusinessCardSheetLayout {
  const { columns, rows, slotWidthCm, slotHeightCm, gapCm } = persisted;
  const cardsPerSheet = columns * rows;

  const placements: GroupTilePackPlacement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const index = row * columns + col + 1;
      placements.push({
        tileId: `card-${index}`,
        label: `${index}/${cardsPerSheet}`,
        xCm: persisted.marginXCm + col * (slotWidthCm + gapCm),
        yCm: persisted.marginYCm + row * (slotHeightCm + gapCm),
        widthCm: slotWidthCm,
        heightCm: slotHeightCm,
        rotated: persisted.rotated,
      });
    }
  }

  return {
    sheetWidthCm: persisted.sheetWidthCm,
    sheetHeightCm: persisted.sheetHeightCm,
    slotWidthCm,
    slotHeightCm,
    rotated: persisted.rotated,
    columns,
    rows,
    cardsPerSheet,
    gapCm,
    marginXCm: persisted.marginXCm,
    marginYCm: persisted.marginYCm,
    placements,
  };
}

/** Sheets needed for a run, rounded up to a whole sheet. */
export function sheetsForQuantity(quantity: number, cardsPerSheet: number): number {
  if (!(quantity > 0) || !(cardsPerSheet > 0)) return 0;
  return Math.ceil(quantity / cardsPerSheet);
}
