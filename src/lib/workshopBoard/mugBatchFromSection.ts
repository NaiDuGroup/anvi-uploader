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
 * `composeMugSheetPng.computeMugSheetLayout`, which puts that box on the
 * right-hand slot coordinates so the trim stays identical.
 *
 * No DOM, no network — easily unit-tested. The browser-side orchestrator
 * (`runMugSectionBatch.ts`) wires fetch/compose/PATCH on top.
 */

import type {
  WorkshopBoardFile,
  WorkshopBoardLine,
  WorkshopBoardSection,
} from "./types";
import { boardLineStatus } from "@/lib/orderStatusFromLines";
import { boardLineKey } from "./lineStatusClient";

// ─── Public constants ───────────────────────────────────────────────────────

/**
 * Only LINES in this status (the line's own status in order-status words,
 * `boardLineStatus`: WAITING → SENT_TO_WORKSHOP) are eligible for the
 * auto-batcher. A line already printing or done is excluded from both compose
 * (not to waste sublimation paper) and the follow-up line status update, which
 * is what keeps a second click from reprinting the same mugs. The order's
 * status does not matter: a mug waiting in an order whose banner prints is
 * still batched.
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
 * Keep only tiles whose underlying LINE is still in
 * {@link MUG_BATCH_ELIGIBLE_STATUS}. The caller passes a snapshot from
 * {@link mugLineStatusSnapshot} so this stays a pure function; the snapshot
 * comes from the current workshop-board fetch, and the board refreshes after
 * every status change.
 */
export function filterMugTilesReadyForBatch(
  tiles: readonly MugBatchTileFromSection[],
  statusByLineKey: ReadonlyMap<string, string>,
): MugBatchTileFromSection[] {
  return tiles.filter(
    (t) => statusByLineKey.get(boardLineKey(t.orderId, t.orderLineId)) === MUG_BATCH_ELIGIBLE_STATUS,
  );
}

/**
 * The snapshot filterMugTilesReadyForBatch reads: board line key (`orderId::orderLineId`)
 * → the LINE's status in order-status words (`boardLineStatus`). A mug or
 * notebook still waiting in an order whose banner already prints is
 * SENT_TO_WORKSHOP here, so it is batched; a line already printing is not.
 */
export function mugLineStatusSnapshot(
  section: WorkshopBoardSection,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const g of section.groups) {
    for (const l of g.lines) {
      out.set(boardLineKey(l.orderId, l.orderLineId), boardLineStatus(l.status, l.lineStatus));
    }
  }
  return out;
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
