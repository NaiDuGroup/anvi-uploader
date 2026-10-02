"use strict";

/**
 * Browser-side orchestrator for the "assemble & send to workshop" button on
 * the notebook section of `/admin/workshop-board`.
 *
 *   1. For each batch (≤ 8 tiles): fetch original PNGs, run
 *      `composeNotebookBatchPng`, hand the operator a `downloadBlob`, and
 *      best-effort POST into the 7-day history.
 *   2. After all batches: `PATCH /api/orders/:id` → `WORKSHOP_PRINTING` for
 *      each unique `orderId` in the snapshot.
 *
 * All failures are isolated — one bad `fetch` doesn't kill the batch, one
 * bad batch doesn't kill the status update. Everything is tallied into the
 * returned {@link BatchRunResult} so the modal can render a summary.
 */

import {
  buildNotebookBatchFileName,
} from "@/lib/notebook/parseNotebookColorFromFileName";
import {
  composeNotebookBatchPng,
  downloadBlob,
} from "@/lib/notebook/composeNotebookBatchPng";
import { uploadWorkshopBatch } from "@/lib/workshopBatches/uploadClient";
import type { NotebookBatchTileFromSection } from "./notebookBatchFromSection";
import { orderIdsToPromote } from "./notebookBatchFromSection";

// ─── Types ──────────────────────────────────────────────────────────────────

export type BatchStage =
  | "fetching"
  | "composing"
  | "updating-status"
  | "done";

export interface BatchProgress {
  stage: BatchStage;
  /** 1-based position inside the stage (file index while fetching, batch
   *  index while composing, order index while updating status). */
  current: number;
  /** Total items for the current stage. */
  total: number;
}

export interface BatchRunResult {
  /** Number of PNGs the operator received on disk. */
  batchesGenerated: number;
  /** Number of PNGs we failed to compose (counted separately from fetch
   *  failures — a batch is only "failed to compose" after we have all
   *  blobs for it). */
  batchesFailed: number;
  /** Total tiles the runner started with (= fresh snapshot size). */
  totalTiles: number;
  /** Tiles skipped because their fetch failed. */
  fetchFailures: number;
  /** Statuses successfully flipped to WORKSHOP_PRINTING. */
  statusesUpdated: number;
  /** Order PATCHes that returned non-2xx. */
  statusesFailed: number;
  /** History uploads that failed (non-fatal; download still succeeded). */
  uploadFailures: number;
}

export interface RunNotebookSectionBatchArgs {
  /** Already filtered + pre-split by the caller via `splitNotebookTilesIntoBatches`. */
  readonly tilesInBatches: readonly (readonly NotebookBatchTileFromSection[])[];
  /** Progress callback — pure UI concern, called synchronously in-between
   *  async steps so modal animations stay responsive. */
  readonly onProgress: (p: BatchProgress) => void;
}

// ─── Public entry point ─────────────────────────────────────────────────────

export async function runNotebookSectionBatch(
  args: RunNotebookSectionBatchArgs,
): Promise<BatchRunResult> {
  const { tilesInBatches, onProgress } = args;
  const flat = tilesInBatches.flat();
  const result: BatchRunResult = {
    batchesGenerated: 0,
    batchesFailed: 0,
    totalTiles: flat.length,
    fetchFailures: 0,
    statusesUpdated: 0,
    statusesFailed: 0,
    uploadFailures: 0,
  };

  if (tilesInBatches.length === 0 || flat.length === 0) {
    onProgress({ stage: "done", current: 0, total: 0 });
    return result;
  }

  // ─ Stage 1: fetch all blobs upfront.  We keep the per-tile mapping so
  //   a single fetch failure drops only that tile, not the whole batch.
  //   File is the only shape `composeNotebookBatchPng` accepts.
  onProgress({ stage: "fetching", current: 0, total: flat.length });
  const fetchedByTileIndex = new Map<number, File>();
  for (let i = 0; i < flat.length; i += 1) {
    const tile = flat[i]!;
    try {
      const res = await fetch(tile.file.fileUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = tile.file.fileName || `tile-${i + 1}.png`;
      fetchedByTileIndex.set(
        i,
        new File([blob], name, {
          type: blob.type || "image/png",
        }),
      );
    } catch (error) {
      console.error(
        `runNotebookSectionBatch: fetch failed for ${tile.file.fileUrl}:`,
        error,
      );
      result.fetchFailures += 1;
    }
    onProgress({ stage: "fetching", current: i + 1, total: flat.length });
  }

  // ─ Stage 2: compose each batch. We keep a running `cursor` into `flat`
  //   so the per-batch tile indices line up with `fetchedByTileIndex`.
  const totalBatches = tilesInBatches.length;
  let cursor = 0;
  for (let b = 0; b < totalBatches; b += 1) {
    const batch = tilesInBatches[b]!;
    const files: File[] = [];
    const batchParsed = [];
    for (let j = 0; j < batch.length; j += 1) {
      const tile = batch[j]!;
      const fetched = fetchedByTileIndex.get(cursor + j);
      if (fetched) {
        files.push(fetched);
        batchParsed.push(tile.parsed);
      }
    }
    cursor += batch.length;

    onProgress({ stage: "composing", current: b + 1, total: totalBatches });

    // Composer min is 2 — if too many tiles dropped out, skip the batch.
    if (files.length < 2) {
      console.warn(
        `runNotebookSectionBatch: batch ${b + 1} has only ${files.length} fetched files, skipping compose`,
      );
      result.batchesFailed += 1;
      continue;
    }

    try {
      const composed = await composeNotebookBatchPng(files);
      const fileName = buildNotebookBatchFileName(batchParsed);
      downloadBlob(composed.blob, fileName);
      result.batchesGenerated += 1;

      // History upload is best-effort: a failure here doesn't invalidate
      // the download the operator already has.
      try {
        await uploadWorkshopBatch({
          kind: "notebook",
          fileName,
          tileCount: files.length,
          blob: composed.blob,
        });
      } catch (uploadError) {
        console.error(
          `runNotebookSectionBatch: history upload failed for batch ${b + 1}:`,
          uploadError,
        );
        result.uploadFailures += 1;
      }
    } catch (composeError) {
      console.error(
        `runNotebookSectionBatch: compose failed for batch ${b + 1}:`,
        composeError,
      );
      result.batchesFailed += 1;
    }
  }

  // ─ Stage 3: flip statuses to WORKSHOP_PRINTING in parallel.
  //
  // We fire these only for orders that had at least one *generated* batch —
  // if all their batches failed to fetch/compose, we leave the status alone
  // so the operator can retry.
  const promotedCandidates = result.batchesGenerated > 0
    ? orderIdsToPromote(flat)
    : [];
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
    for (const s of settlements) {
      if (s.status === "fulfilled") result.statusesUpdated += 1;
      else result.statusesFailed += 1;
    }
  }

  onProgress({ stage: "done", current: flat.length, total: flat.length });
  return result;
}
