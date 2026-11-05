"use client";

import { studioId, type StudioDoc, type StudioImageLayer } from "./document";
import { resolveStudioFamily } from "./fonts";
import type { StudioRenderAssets } from "./render";
import { getBlob, putBlob } from "./storage";

/**
 * Photos of the Studio in this browser. Each photo has a local id: its
 * original file (kept in IndexedDB, used for the print file and the upload)
 * and a working copy of at most `PREVIEW_MAX_PX` on the long side for the
 * editor and the 3D texture (phones run out of canvas memory with 12 MP
 * photos on every redraw).
 */

export const PREVIEW_MAX_PX = 2500;
export const STUDIO_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const STUDIO_PHOTO_MAX_BYTES = 40 * 1024 * 1024;

type Bitmap = ImageBitmap | HTMLCanvasElement | HTMLImageElement;

interface Entry {
  original: Blob;
  preview: Bitmap | null;
  naturalW: number;
  naturalH: number;
}

async function decode(blob: Blob): Promise<Bitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Keep the object URL alive until decoded; the element holds the pixels afterwards.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function sizeOf(b: Bitmap): { w: number; h: number } {
  if (typeof HTMLImageElement !== "undefined" && b instanceof HTMLImageElement) return { w: b.naturalWidth, h: b.naturalHeight };
  return { w: b.width, h: b.height };
}

function downscale(b: Bitmap, maxSide: number): Bitmap {
  const { w, h } = sizeOf(b);
  const k: number = Math.min(1, maxSide / Math.max(w, h));
  if (k >= 1) return b;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext("2d");
  if (!ctx) return b;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(b, 0, 0, c.width, c.height);
  if ("close" in b && typeof b.close === "function") b.close();
  return c;
}

export class StudioAssetStore {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<boolean>>();
  private missing = new Set<string>();
  private listeners = new Set<() => void>();
  /** Bumps whenever a photo becomes available (redraw). */
  version = 0;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Take a file the customer picked: stored locally, decoded, working copy made. */
  async addFile(file: Blob): Promise<{ localId: string; naturalW: number; naturalH: number; mime: string }> {
    const bmp: Bitmap = await decode(file);
    const { w, h } = sizeOf(bmp);
    const localId: string = studioId("img");
    this.entries.set(localId, { original: file, preview: downscale(bmp, PREVIEW_MAX_PX), naturalW: w, naturalH: h });
    void putBlob(localId, file);
    this.emit();
    return { localId, naturalW: w, naturalH: h, mime: file.type || "image/jpeg" };
  }

  has(localId: string): boolean {
    return this.entries.has(localId);
  }

  isMissing(localId: string): boolean {
    return this.missing.has(localId);
  }

  /** Load a photo of a saved document from IndexedDB; false when it is gone. */
  ensure(localId: string): Promise<boolean> {
    if (this.entries.has(localId)) return Promise.resolve(true);
    if (this.missing.has(localId)) return Promise.resolve(false);
    const inFlight = this.pending.get(localId);
    if (inFlight) return inFlight;
    const p = (async () => {
      const blob = await getBlob(localId);
      if (!blob) {
        this.missing.add(localId);
        this.emit();
        return false;
      }
      const bmp = await decode(blob);
      const { w, h } = sizeOf(bmp);
      this.entries.set(localId, { original: blob, preview: downscale(bmp, PREVIEW_MAX_PX), naturalW: w, naturalH: h });
      this.emit();
      return true;
    })()
      .catch(() => {
        this.missing.add(localId);
        return false;
      })
      .finally(() => this.pending.delete(localId));
    this.pending.set(localId, p);
    return p;
  }

  /** Original file of a photo (upload, print). */
  original(localId: string): Blob | null {
    return this.entries.get(localId)?.original ?? null;
  }

  preview(localId: string): Bitmap | null {
    return this.entries.get(localId)?.preview ?? null;
  }

  /** Assets for the editor and the live 3D texture (working copies; missing photos load in the background). */
  editorAssets(): StudioRenderAssets {
    return {
      image: (layer: StudioImageLayer) => {
        const id = layer.src?.localId;
        if (!id) return null;
        const p = this.preview(id);
        if (!p) void this.ensure(id);
        return p;
      },
      font: resolveStudioFamily,
    };
  }

  /**
   * Assets for the print file: every photo of the document decoded at full
   * size (one at a time is enough: the export draws them in order).
   */
  async exportAssets(doc: StudioDoc): Promise<{ assets: StudioRenderAssets; release: () => void; missing: string[] }> {
    const full = new Map<string, Bitmap>();
    const missing: string[] = [];
    for (const s of doc.surfaces) {
      for (const l of s.layers) {
        const id = l.kind === "image" ? l.src?.localId : undefined;
        if (!id || full.has(id)) continue;
        await this.ensure(id);
        const orig = this.original(id);
        if (!orig) {
          missing.push(id);
          continue;
        }
        full.set(id, await decode(orig));
      }
    }
    return {
      assets: {
        image: (layer) => (layer.src?.localId ? (full.get(layer.src.localId) ?? null) : null),
        font: resolveStudioFamily,
      },
      release: () => {
        for (const b of full.values()) if ("close" in b && typeof b.close === "function") b.close();
        full.clear();
      },
      missing,
    };
  }
}
