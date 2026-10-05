"use strict";

/**
 * Browser-side orchestrator for the "assemble & send to workshop" button on
 * the mug section of `/admin/workshop-board`.
 *
 *   1. For each sheet (≤ 2 tiles): fetch original designs, run
 *      `composeMugSheetPng`, hand the operator a `downloadBlob`, and
 *      best-effort POST into the 7-day history.
 *   2. After all sheets: `PATCH /api/orders/:id` → `WORKSHOP_PRINTING` for
 *      each unique `orderId` in the snapshot, so the same mugs can't be sent
 *      to print twice.
 *
 * All failures are isolated — one bad `fetch` doesn't kill the sheet, one bad
 * sheet doesn't kill the status update. Everything is tallied into the
 * returned {@link MugBatchRunResult} so the modal can render a summary.
 *
 * Structurally identical to `runNotebookSectionBatch.ts`; the differences are
 * the composer, the `mug` history kind, and the fact that a one-tile sheet is
 * valid here so there is no minimum-tile skip.
 */

import {
  buildMugSheetFileName,
  composeMugSheetPng,
} from "@/lib/mug/composeMugSheetPng";
import { downloadBlob } from "@/lib/notebook/composeNotebookBatchPng";
import { uploadWorkshopBatch } from "@/lib/workshopBatches/uploadClient";
import type { MugBatchTileFromSection } from "./mugBatchFromSection";
import { mugOrderIdsToPromote } from "./mugBatchFromSection";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MugBatchStage =
  | "fetching"
  | "composing"
  | "updating-status"
  | "done";

export interface MugBatchProgress {
  stage: MugBatchStage;
  /** 1-based position inside the stage (file index while fetching, sheet
   *  index while composing, order index while updating status). */
  current: number;
  /** Total items for the current stage. */
  total: number;
}

export interface MugBatchRunResult {
  /** Number of A4 sheets the operator received on disk. */
  sheetsGenerated: number;
  /** Sheets we failed to compose (counted separately from fetch failures). */
  sheetsFailed: number;
  /** Total tiles the runner started with (= fresh snapshot size). */
  totalTiles: number;
  /** Tiles skipped because their fetch failed. */
  fetchFailures: number;
  /** Tiles whose aspect ratio drifted from 21 × 9.6 cm and were letterboxed. */
  aspectWarnings: number;
  /** Statuses successfully flipped to WORKSHOP_PRINTING. */
  statusesUpdated: number;
  /** Order PATCHes that returned non-2xx. */
  statusesFailed: number;
  /** History uploads that failed (non-fatal; download still succeeded). */
  uploadFailures: number;
}

export interface RunMugSectionBatchArgs {
  /** Already filtered + pre-split by the caller via `splitMugTilesIntoSheets`. */
  readonly tilesInSheets: readonly (readonly MugBatchTileFromSection[])[];
  /** Progress callback — pure UI concern, called synchronously in-between
   *  async steps so modal animations stay responsive. */
  readonly onProgress: (p: MugBatchProgress) => void;
}

// ─── Public entry point ─────────────────────────────────────────────────────

export async function runMugSectionBatch(
  args: RunMugSectionBatchArgs,
): Promise<MugBatchRunResult> {
  const { tilesInSheets, onProgress } = args;
  const flat = tilesInSheets.flat();
  const result: MugBatchRunResult = {
    sheetsGenerated: 0,
    sheetsFailed: 0,
    totalTiles: flat.length,
    fetchFailures: 0,
    aspectWarnings: 0,
    statusesUpdated: 0,
    statusesFailed: 0,
    uploadFailures: 0,
  };

  if (tilesInSheets.length === 0 || flat.length === 0) {
    onProgress({ stage: "done", current: 0, total: 0 });
    return result;
  }

  // ─ Stage 1: fetch all designs upfront. We keep the per-tile mapping so a
  //   single fetch failure drops only that tile, not the whole sheet.
  //
  // Route through `/api/download/:fileId` — it handles both local-dev (reads
  // from disk) and prod (presigns the R2 object), so we never have to care
  // about the raw storage key stored in `file.fileUrl`.
  onProgress({ stage: "fetching", current: 0, total: flat.length });
  const fetchedByTileIndex = new Map<number, File>();
  for (let i = 0; i < flat.length; i += 1) {
    const tile = flat[i]!;
    try {
      const res = await fetch(`/api/download/${tile.file.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = tile.file.fileName || `mug-${i + 1}.png`;
      fetchedByTileIndex.set(
        i,
        new File([blob], name, { type: blob.type || "image/png" }),
      );
    } catch (error) {
      console.error(
        `runMugSectionBatch: fetch failed for fileId=${tile.file.id} (${tile.file.fileName}):`,
        error,
      );
      result.fetchFailures += 1;
    }
    onProgress({ stage: "fetching", current: i + 1, total: flat.length });
  }

  // ─ Stage 2: compose each sheet. We keep a running `cursor` into `flat` so
  //   the per-sheet tile indices line up with `fetchedByTileIndex`.
  const totalSheets = tilesInSheets.length;
  let cursor = 0;
  for (let s = 0; s < totalSheets; s += 1) {
    const sheet = tilesInSheets[s]!;
    const files: File[] = [];
    const orderNumbers: (number | null)[] = [];
    for (let j = 0; j < sheet.length; j += 1) {
      const tile = sheet[j]!;
      const fetched = fetchedByTileIndex.get(cursor + j);
      if (fetched) {
        files.push(fetched);
        orderNumbers.push(tile.orderNumber);
      }
    }
    cursor += sheet.length;

    onProgress({ stage: "composing", current: s + 1, total: totalSheets });

    // Every tile on this sheet failed to download — nothing left to print.
    if (files.length === 0) {
      console.warn(
        `runMugSectionBatch: sheet ${s + 1} has no fetched files, skipping compose`,
      );
      result.sheetsFailed += 1;
      continue;
    }

    try {
      const composed = await composeMugSheetPng(files);
      result.aspectWarnings += composed.warnings.length;
      const fileName = buildMugSheetFileName(orderNumbers);
      downloadBlob(composed.blob, fileName);
      result.sheetsGenerated += 1;

      // History upload is best-effort: a failure here doesn't invalidate the
      // download the operator already has.
      try {
        await uploadWorkshopBatch({
          kind: "mug",
          fileName,
          tileCount: files.length,
          blob: composed.blob,
        });
      } catch (uploadError) {
        console.error(
          `runMugSectionBatch: history upload failed for sheet ${s + 1}:`,
          uploadError,
        );
        result.uploadFailures += 1;
      }
    } catch (composeError) {
      console.error(
        `runMugSectionBatch: compose failed for sheet ${s + 1}:`,
        composeError,
      );
      result.sheetsFailed += 1;
    }
  }

  // ─ Stage 3: flip statuses to WORKSHOP_PRINTING in parallel.
  //
  // Only when at least one sheet actually landed on disk — otherwise we leave
  // the statuses alone so the operator can retry.
  const promotedCandidates =
    result.sheetsGenerated > 0 ? mugOrderIdsToPromote(flat) : [];
  onProgress({
    stage: "updating-status",
    current: 0,
    total: promotedCandidates.length,
  });

  if (promotedCandidates.length > 0) {
    const settlements = await Promise.allSettled(
      promotedCandidates.map(async (orderId, i) => {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "WORKSHOP_PRINTING" }),
        });
        onProgress({
          stage: "updating-status",
          current: i + 1,
          total: promotedCandidates.length,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),
    );
    for (const settlement of settlements) {
      if (settlement.status === "fulfilled") result.statusesUpdated += 1;
      else result.statusesFailed += 1;
    }
  }

  onProgress({ stage: "done", current: flat.length, total: flat.length });
  return result;
}
