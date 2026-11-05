"use strict";

/**
 * Pure helpers for the workshop-board auto-batcher: take a notebook section
 * straight off `WorkshopBoardData` and turn it into the inputs the
 * notebook-batch composer expects (ordered tiles with parsed color + order
 * number) plus the idempotency plumbing (status filter + target orderIds).
 *
 * No DOM, no network — easily unit-tested. The browser-side orchestrator
 * (`runNotebookSectionBatch.ts`) wires fetch/compose/PATCH on top.
 */

import {
  parseNotebookColorFromFileName,
  type ParsedNotebookFileName,
} from "@/lib/notebook/parseNotebookColorFromFileName";
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
 * auto-batcher; of the board's statuses only «waiting for print» is new work.
 *
 * A line already printing or done is excluded both from compose (not to waste
 * paper/ink) and from the follow-up line status update. The order's status
 * does not matter: a notebook waiting in an order whose banner prints is
 * still batched.
 */
export const NOTEBOOK_BATCH_ELIGIBLE_STATUS = "SENT_TO_WORKSHOP";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * One slot in the output grid. Mirrors `NotebookBatchLayoutTool`'s per-tile
 * payload (file + parsed name) and carries the originating `orderId` /
 * `orderLineId` so the runner can roll statuses afterwards.
 */
export interface NotebookBatchTileFromSection {
  orderId: string;
  orderNumber: number;
  orderLineId: string;
  /** The underlying board file (for `fileUrl`, `fileName`, `copies`). */
  file: WorkshopBoardFile;
  /** Color + orderNumber parsed from `file.fileName`; `orderNumber` is
   *  always overridden to `line.orderNumber` (which is authoritative). */
  parsed: ParsedNotebookFileName;
}

// ─── Flatten section → ordered tile list ────────────────────────────────────

/**
 * Walk the section in UI order (groups → lines → files) and expand each file
 * by `copies` so a line with `{copies: 3}` yields 3 identical tiles.
 *
 * This matches what the operator sees on the UV bed: 3 identical covers of
 * the same order should land as 3 adjacent slots in the output PNG.
 */
export function flattenNotebookSectionTiles(
  section: WorkshopBoardSection,
): NotebookBatchTileFromSection[] {
  const tiles: NotebookBatchTileFromSection[] = [];
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
): NotebookBatchTileFromSection {
  const parsed = parseNotebookColorFromFileName(file.fileName);
  // Override `orderNumber` with the authoritative value from the line —
  // the parser may miss it if the file name doesn't start with digits.
  const parsedWithOrder: ParsedNotebookFileName = {
    ...parsed,
    orderNumber: line.orderNumber,
  };
  return {
    orderId: line.orderId,
    orderNumber: line.orderNumber,
    orderLineId: line.orderLineId,
    file,
    parsed: parsedWithOrder,
  };
}

// ─── Status filter (idempotency boundary) ───────────────────────────────────

/**
 * Keep only tiles whose underlying LINE is still in
 * {@link NOTEBOOK_BATCH_ELIGIBLE_STATUS}. The caller passes a snapshot from
 * {@link notebookLineStatusSnapshot} so this stays a pure function.
 *
 * The snapshot comes from the current workshop-board fetch; since the board
 * refreshes after every status change, repeated clicks on the CTA always
 * see an up-to-date "fresh" subset.
 */
export function filterTilesReadyForBatch(
  tiles: readonly NotebookBatchTileFromSection[],
  statusByLineKey: ReadonlyMap<string, string>,
): NotebookBatchTileFromSection[] {
  return tiles.filter(
    (t) => statusByLineKey.get(boardLineKey(t.orderId, t.orderLineId)) === NOTEBOOK_BATCH_ELIGIBLE_STATUS,
  );
}

/**
 * The snapshot filterTilesReadyForBatch reads: board line key (`orderId::orderLineId`)
 * → the LINE's status in order-status words (`boardLineStatus`). A mug or
 * notebook still waiting in an order whose banner already prints is
 * SENT_TO_WORKSHOP here, so it is batched; a line already printing is not.
 */
export function notebookLineStatusSnapshot(
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
 * Unique `orderId`s in the given tiles, in first-appearance order. Used by
 * the orchestrator to issue one `PATCH /api/orders/:id` per order (several
 * notebook lines of the same order shouldn't fire the status update twice).
 */
export function orderIdsToPromote(
  tiles: readonly NotebookBatchTileFromSection[],
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

// ─── Batch splitter ─────────────────────────────────────────────────────────

/**
 * Split tiles into chunks of at most `max`. If the trailing chunk ends up
 * with just one tile, we steal one from the previous chunk so the composer
 * (which requires ≥ 2 tiles per PNG) never faces a 1-tile batch.
 *
 * Examples (max=8):
 *   8  → [[8]]
 *   9  → [[8], [1]] → fix-up → [[7], [2]]
 *   17 → [[8], [8], [1]] → fix-up → [[8], [7], [2]]
 *   25 → [[8], [8], [8], [1]] → fix-up → [[8], [8], [7], [2]]
 *   2  → [[2]]
 *   1  → [[1]]   // caller must gate on `.length >= 2` upstream
 */
export function splitNotebookTilesIntoBatches<T>(
  tiles: readonly T[],
  max: number,
): T[][] {
  if (!Number.isInteger(max) || max < 2) {
    throw new Error(`max must be an integer >= 2, got ${max}`);
  }
  if (tiles.length === 0) return [];

  const batches: T[][] = [];
  for (let i = 0; i < tiles.length; i += max) {
    batches.push(tiles.slice(i, i + max));
  }
  // Fix-up: if the last batch has exactly one tile and we have a predecessor,
  // move one from the predecessor to make `[..prev-1, lonely]` → `[prev, lonely+1]`.
  if (batches.length > 1 && batches[batches.length - 1]!.length === 1) {
    const prev = batches[batches.length - 2]!;
    const last = batches[batches.length - 1]!;
    const stolen = prev.pop()!;
    last.unshift(stolen);
  }
  return batches;
}
