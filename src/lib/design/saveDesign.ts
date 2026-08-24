"use client";

import { exportCanvasAsBlob, blobToFile } from "@/lib/mug/exportLayout";
import { uploadFile } from "@/app/admin/_components/orderForms/uploadHelpers";
import type { DesignDoc } from "./doc";

/**
 * Persisting a design has two halves:
 *   1. the document JSON (cheap, autosaved on every edit), and
 *   2. the rendered artifacts — a print-resolution PNG plus a small preview
 *      for the library grid (expensive, so only on explicit save / before
 *      handing the design to the order wizard).
 *
 * The print PNG is what the workshop eventually receives, so it is exported
 * at the design's own DPI with matching pHYs metadata.
 */

const THUMB_MAX_PX = 400;

export interface DesignRenderKeys {
  renderKey: string;
  thumbKey: string;
}

/** Downscale a full-resolution canvas into a preview PNG blob. */
async function buildThumbnailBlob(source: HTMLCanvasElement): Promise<Blob> {
  const ratio = source.width / source.height;
  let width = THUMB_MAX_PX;
  let height = THUMB_MAX_PX;
  if (ratio >= 1) {
    height = Math.max(1, Math.round(THUMB_MAX_PX / ratio));
  } else {
    width = Math.max(1, Math.round(THUMB_MAX_PX * ratio));
  }

  const thumb = document.createElement("canvas");
  thumb.width = width;
  thumb.height = height;
  const ctx = thumb.getContext("2d");
  if (!ctx) throw new Error("Thumbnail context unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    thumb.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Thumbnail export failed"))),
      "image/png",
      0.9,
    );
  });
}

/**
 * Render, upload and return the storage keys for a design. `exportCanvas`
 * must produce a canvas at full print resolution (scale 1).
 */
export async function uploadDesignRender(input: {
  exportCanvas: HTMLCanvasElement;
  dpi: number;
  fileName: string;
}): Promise<DesignRenderKeys> {
  const printBlob = await exportCanvasAsBlob(input.exportCanvas, input.dpi);
  const printUpload = await uploadFile(blobToFile(printBlob, input.fileName));

  const thumbBlob = await buildThumbnailBlob(input.exportCanvas);
  const thumbUpload = await uploadFile(
    blobToFile(thumbBlob, `thumb-${input.fileName}`),
  );

  return { renderKey: printUpload.fileUrl, thumbKey: thumbUpload.fileUrl };
}

export interface SaveDesignPayload {
  title?: string;
  status?: "draft" | "ready" | "archived";
  doc?: DesignDoc;
  isTemplate?: boolean;
  tags?: string[];
  renderKey?: string;
  thumbKey?: string;
}

export async function patchDesign(
  designId: string,
  payload: SaveDesignPayload,
): Promise<void> {
  const res = await fetch(`/api/admin/designs/${designId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Save failed (${res.status})`);
  }
}
