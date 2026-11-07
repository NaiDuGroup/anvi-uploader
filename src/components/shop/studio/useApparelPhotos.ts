"use client";

import { useEffect, useState } from "react";
import { apparelViews, type ApparelView } from "@/lib/studio/apparelMockup";
import type { ApparelShape } from "@/lib/studio/apparel";
import type { Raster, Rect } from "@/lib/studio/photoMockup";
import { composeApparelPhoto, cutOut, loadApparelPhotoView, loadRaster, rasterCanvas, type ApparelPhotoPrint, type ApparelPhotoView } from "./apparelPhoto";
import type { ApparelMockupPrint } from "./ApparelMockup";

export type ApparelPhotoViews = Partial<Record<ApparelView, ApparelPhotoView>>;

export interface ApparelPhotosState {
  views: ApparelPhotoViews;
  /** loading: not known yet; ready: at least one view has a photo; none: drawn garments (no photo / failed). */
  status: "loading" | "ready" | "none";
}

/** The garment photos of a shape in a colour (every view it has). */
export function useApparelPhotoViews(shape: ApparelShape, colour: { key: string; hex: string } | null): ApparelPhotosState {
  const id = colour ? `${shape}|${colour.key}|${colour.hex}` : null;
  const [state, setState] = useState<{ id: string | null; views: ApparelPhotoViews; status: ApparelPhotosState["status"] }>({ id: null, views: {}, status: "loading" });
  useEffect(() => {
    if (!colour || !id) return;
    let live = true;
    void Promise.all(apparelViews(shape).map(async (v) => [v, await loadApparelPhotoView(shape, v, colour)] as const)).then((pairs) => {
      if (!live) return;
      const views: ApparelPhotoViews = {};
      for (const [v, pv] of pairs) if (pv) views[v] = pv;
      setState({ id, views, status: Object.keys(views).length ? "ready" : "none" });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by `id`
  }, [id]);
  if (state.id !== id) return { views: {}, status: "loading" };
  return { views: state.views, status: state.status };
}

/** Every photo view with the prints of its zones on it (canvases). */
export async function composeApparelViews(
  views: ApparelPhotoViews,
  prints: readonly ApparelMockupPrint[],
  /** Also the cut-out versions (the editor canvas overlay). */
  cut?: Partial<Record<ApparelView, HTMLCanvasElement>>,
): Promise<Partial<Record<ApparelView, HTMLCanvasElement>>> {
  const out: Partial<Record<ApparelView, HTMLCanvasElement>> = {};
  for (const [view, pv] of Object.entries(views) as [ApparelView, ApparelPhotoView][]) {
    const mine: ApparelPhotoPrint[] = [];
    for (const p of prints) {
      if (p.box.view !== view || !p.src) continue;
      const art: Raster = await loadRaster(p.src);
      mine.push({ box: p.box, art });
    }
    const t0: number = performance.now();
    const r: Raster = composeApparelPhoto(pv, mine);
    // Readable in devtools / tests: performance.getEntriesByName("apparel-compose").
    try {
      performance.measure("apparel-compose", { start: t0, end: performance.now(), detail: view });
    } catch {
      // Old browsers: no measure options.
    }
    out[view] = rasterCanvas(r);
    if (cut) cut[view] = rasterCanvas(cutOut(r, pv.maps));
  }
  return out;
}

/** A cheap fingerprint of a (long) data URL. */
function quickHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 3) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${s.length}.${(h >>> 0).toString(36)}`;
}

export interface ApparelComposites {
  /** On the photo's white. */
  canvases: Partial<Record<ApparelView, HTMLCanvasElement>>;
  /** Cut out (transparent around the garment): the editor canvas. */
  cutOut: Partial<Record<ApparelView, HTMLCanvasElement>>;
  /** The `key` the canvases were composed for (stale while it differs from the current one). */
  key: string | null;
}

/**
 * The photo views with the current prints composited, recomputed when the
 * prints or the photos change (`key` = what the prints were drawn from, e.g.
 * the document version).
 */
export function useApparelComposites(photos: ApparelPhotosState, prints: readonly ApparelMockupPrint[], key: string): ApparelComposites {
  const [state, setState] = useState<ApparelComposites>({ canvases: {}, cutOut: {}, key: null });
  const sig: string = `${key}|${Object.values(photos.views)
    .map((v) => `${v.key}:${v.recoloured ? "r" : ""}${v.photo.width}`)
    .join(",")}|${prints.map((p) => `${p.zone}:${p.box.x},${p.box.y},${p.box.w},${p.box.h}:${p.src ? quickHash(p.src) : "-"}`).join(";")}`;
  useEffect(() => {
    if (photos.status !== "ready") return;
    let live = true;
    const cut: Partial<Record<ApparelView, HTMLCanvasElement>> = {};
    void composeApparelViews(photos.views, prints, cut)
      .then((canvases) => live && setState({ canvases, cutOut: cut, key }))
      .catch((e: unknown) => console.warn("[studio] apparel composite failed:", e));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by `sig`
  }, [sig]);
  return state;
}

/** A canvas as a data URL to show in an <img> (JPEG on white), long side `maxSide`, cropped to `crop`. */
export function canvasDataUrl(src: HTMLCanvasElement, maxSide: number, quality = 0.88, crop?: Rect | null): string {
  return framedCanvas(src, maxSide, crop)?.toDataURL("image/jpeg", quality) ?? "";
}

/** The garment's square frame on its photo: its bounds plus a margin, square, within the photo. */
export function garmentFrame(v: Pick<ApparelPhotoView, "garment" | "photo">, margin = 0.05): Rect {
  const g: Rect = v.garment;
  const side: number = Math.min(Math.max(v.photo.width, v.photo.height), Math.max(g.w, g.h) * (1 + 2 * margin));
  const x: number = Math.min(Math.max(0, g.x + g.w / 2 - side / 2), v.photo.width - side);
  const y: number = Math.min(Math.max(0, g.y + g.h / 2 - side / 2), v.photo.height - side);
  return { x, y, w: side, h: side };
}

/** `src` (cropped to `crop`) drawn on white, long side ≤ `maxSide`. */
export function framedCanvas(src: HTMLCanvasElement, maxSide: number, crop?: Rect | null): HTMLCanvasElement | null {
  const r: Rect = crop ?? { x: 0, y: 0, w: src.width, h: src.height };
  const k: number = Math.min(1, maxSide / Math.max(r.w, r.h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(r.w * k));
  c.height = Math.max(1, Math.round(r.h * k));
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c;
}
