"use strict";

/**
 * Pure helpers for the workshop-board mug auto-batcher: take the mug section
 * straight off `WorkshopBoardData` and turn it into the inputs the A4 sheet
 * composer expects, plus the idempotency plumbing (status filter + target
 * orderIds).
 *
 * Mirrors `notebookBatchFromSection.ts`, with one deliberate difference: an
 * A4 sheet has exactly two fixed slots, so a lone trailing tile cannot be
 * balanced by stealing from the previous sheet the way notebook batches do.
 * A tail sheet with a single mug is a normal outcome — see
 * `composeMugSheetPng.computeMugSheetLayout`, which keeps that box at the
 * slot 0 coordinates so the trim stays identical.
 *
 * No DOM, no network — easily unit-tested. The browser-side orchestrator
 * (`runMugSectionBatch.ts`) wires fetch/compose/PATCH on top.
 */

import type {
  WorkshopBoardFile,
  WorkshopBoardLine,
  WorkshopBoardSection,
} from "./types";

// ─── Public constants ───────────────────────────────────────────────────────

/**
 * Only orders in this status are eligible for the auto-batcher. Anything
 * already in WORKSHOP_PRINTING or beyond is excluded from both compose (not
 * to waste sublimation paper) and the follow-up status update, which is what
 * keeps a second click from reprinting the same mugs.
 */
export const MUG_BATCH_ELIGIBLE_STATUS = "SENT_TO_WORKSHOP";

// ─── Types ──────────────────────────────────────────────────────────────────

/** One slot on an A4 sheet, carrying the origin so the runner can roll statuses. */
export interface MugBatchTileFromSection {
  orderId: string;
  orderNumber: number;
  orderLineId: string;
  /** The underlying board file (for `id`, `fileName`, `copies`). */
  file: WorkshopBoardFile;
}

// ─── Flatten section → ordered tile list ────────────────────────────────────

/**
 * Walk the section in UI order (groups → lines → files) and expand each file
 * by `copies`, so a line with `{copies: 3}` yields three tiles and therefore
 * two sheets (2 + 1).
 */
export function flattenMugSectionTiles(
  section: WorkshopBoardSection,
): MugBatchTileFromSection[] {
  const tiles: MugBatchTileFromSection[] = [];
  for (const group of section.groups) {
    for (const line of group.lines) {
      for (const file of line.files) {
        // Guard against bad data (negative or non-integer copies).
        const copies = Math.max(1, Math.floor(file.copies || 1));
        for (let i = 0; i < copies; i += 1) {
          tiles.push(buildTile(line, file));
        }
      }
    }
  }
  return tiles;
}

function buildTile(
  line: WorkshopBoardLine,
  file: WorkshopBoardFile,
): MugBatchTileFromSection {
  return {
    orderId: line.orderId,
    orderNumber: line.orderNumber,
    orderLineId: line.orderLineId,
    file,
  };
}

// ─── Status filter (idempotency boundary) ───────────────────────────────────

/**
 * Keep only tiles whose underlying order is still in
 * {@link MUG_BATCH_ELIGIBLE_STATUS}. The caller passes a `statusByOrderId`
 * snapshot so this stays a pure function; the snapshot comes from the current
 * workshop-board fetch, and the board refreshes after every status change.
 */
export function filterMugTilesReadyForBatch(
  tiles: readonly MugBatchTileFromSection[],
  statusByOrderId: ReadonlyMap<string, string>,
): MugBatchTileFromSection[] {
  return tiles.filter(
    (t) => statusByOrderId.get(t.orderId) === MUG_BATCH_ELIGIBLE_STATUS,
  );
}

/**
 * Unique `orderId`s in the given tiles, in first-appearance order. Used by the
 * orchestrator to issue one `PATCH /api/orders/:id` per order (several mug
 * lines of the same order shouldn't fire the status update twice).
 */
export function mugOrderIdsToPromote(
  tiles: readonly MugBatchTileFromSection[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tiles) {
    if (seen.has(t.orderId)) continue;
    seen.add(t.orderId);
    out.push(t.orderId);
  }
  return out;
}

// ─── Sheet splitter ─────────────────────────────────────────────────────────

/**
 * Split tiles into sheets of at most `slots`. Unlike the notebook splitter
 * there is no fix-up for a lone trailing tile — the composer accepts a
 * single-tile sheet by design.
 *
 * Examples (slots=2):
 *   2 → [[2]]
 *   3 → [[2], [1]]
 *   5 → [[2], [2], [1]]
 */
export function splitMugTilesIntoSheets<T>(
  tiles: readonly T[],
  slots: number,
): T[][] {
  if (!Number.isInteger(slots) || slots < 1) {
    throw new Error(`slots must be an integer >= 1, got ${slots}`);
  }
  const sheets: T[][] = [];
  for (let i = 0; i < tiles.length; i += slots) {
    sheets.push(tiles.slice(i, i + slots));
  }
  return sheets;
}
