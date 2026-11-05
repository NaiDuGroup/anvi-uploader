"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StudioDoc, StudioKind } from "@/lib/studio/document";
import { renderPreviewCanvas } from "@/lib/studio/exportClient";
import { studioMugLook, mugLookKey, type StudioMugLook } from "@/lib/studio/mugLook";
import { bestMugViewCenter, drawMugMockup, drawPenMockup } from "@/lib/studio/productMockup";
import type { StudioRenderAssets } from "@/lib/studio/render";
import type { StudioSurfaceSpec } from "@/lib/studio/surfaces";
import type { StudioEditorApi } from "./StudioApp";

/**
 * The design drawn on the product in 2D (mug front with handle, pen barrel,
 * notebook cover), for template thumbnails and the «Personalizează» preview.
 * Thumbnails: drawn once visible, one at a time (render queue), cached as
 * small JPEG data URLs by a key, at most 2× the CSS size.
 */

/** Width / height of the picture per product. */
export const PICTURE_ASPECT: Record<StudioKind, number> = {
  mug: 1.2,
  pen: 2.6,
  notebook: 0.8,
};
export const PICTURE_BG = "#f3f1ee";

export interface StudioProductLook {
  kind: StudioKind;
  mug: StudioMugLook | null;
  /** Pen body / notebook cover colour. */
  color: string;
  key: string;
}

/** The product look of the editor's current variant (mug parts / finish, pen or cover colour). */
export function useStudioProductLook(api: Pick<StudioEditorApi, "kind" | "item" | "variant" | "productColor">): StudioProductLook {
  const { kind, item, variant, productColor } = api;
  return useMemo(() => {
    const color: string = productColor ?? "#ffffff";
    if (kind !== "mug") return { kind, mug: null, color, key: `${kind}:${color}` };
    const mug: StudioMugLook = studioMugLook(item, {
      variantHex: variant?.hex ?? null,
    });
    return { kind, mug, color, key: `mug:${mugLookKey(mug)}` };
  }, [kind, item, variant?.hex, productColor]);
}

/** A renderAssets object that stays the same between renders (the editor makes a new one each time). */
export function useStableAssets(assets: StudioRenderAssets): StudioRenderAssets {
  const ref = useRef(assets);
  useEffect(() => {
    ref.current = assets;
  });
  return useMemo(
    () => ({
      image: (l) => ref.current.image(l),
      font: (f) => ref.current.font(f),
    }),
    [],
  );
}

/** All photos of the document are decoded (else the picture would miss them: do not cache it). */
export function photosReady(doc: StudioDoc, assets: StudioRenderAssets): boolean {
  return doc.surfaces.every((s) => s.layers.every((l) => l.kind !== "image" || l.hidden || !l.src || assets.image(l) != null));
}

/** Draw the design on the product into `canvas` (`w × h` device pixels). */
export function drawProductPicture(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  doc: StudioDoc,
  spec: StudioSurfaceSpec,
  assets: StudioRenderAssets,
  look: StudioProductLook,
  scratch?: HTMLCanvasElement,
  background: string | null = PICTURE_BG,
  /** Mug: wrap point (mm) facing the viewer. */
  centerMm?: number,
): void {
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const print = { widthMm: spec.widthMm, heightMm: spec.heightMm };
  if (look.kind === "mug" && look.mug) {
    const design = renderPreviewCanvas(doc, spec, assets, Math.min(1400, Math.ceil(w * 1.5)), scratch);
    drawMugMockup(ctx, w, h, design, print, look.mug, background, centerMm);
    return;
  }
  if (look.kind === "pen") {
    const design = renderPreviewCanvas(doc, spec, assets, Math.min(1400, Math.ceil(w * 0.7)), scratch);
    drawPenMockup(ctx, w, h, design, print, look.color, background);
    return;
  }
  // Notebook: the cover, flat, in its colour.
  const design = renderPreviewCanvas(doc, spec, assets, Math.ceil(Math.max(w, h)), scratch);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = background ?? "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const k: number = Math.min((w * 0.84) / design.width, (h * 0.88) / design.height);
  const dw: number = design.width * k;
  const dh: number = design.height * k;
  const x: number = (w - dw) / 2;
  const y: number = (h - dh) / 2;
  ctx.shadowColor = "rgba(20,33,61,0.25)";
  ctx.shadowBlur = Math.round(w * 0.03);
  ctx.shadowOffsetY = Math.round(w * 0.01);
  ctx.fillStyle = look.color;
  ctx.fillRect(x, y, dw, dh);
  ctx.shadowColor = "transparent";
  ctx.drawImage(design, x, y, dw, dh);
}

// ─── Thumbnail queue + cache ──────────────────────────────────────────────

const CACHE_MAX = 160;
const cache = new Map<string, string>();
let queue: Promise<void> = Promise.resolve();
let scratchCanvas: HTMLCanvasElement | null = null;

export function cachedPicture(key: string): string | null {
  const v = cache.get(key);
  if (v == null) return null;
  cache.delete(key);
  cache.set(key, v);
  return v;
}

function remember(key: string, url: string): void {
  cache.set(key, url);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

const idle = (): Promise<void> =>
  new Promise((r) => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    if (w.requestIdleCallback) w.requestIdleCallback(() => r(), { timeout: 120 });
    else window.setTimeout(r, 0);
  });

/**
 * Render a picture in the queue (one at a time, yielding between): `make`
 * builds the document; null when cancelled meanwhile.
 */
export function queuePicture(
  key: string,
  make: () => Promise<StudioDoc>,
  opts: {
    w: number;
    h: number;
    spec: StudioSurfaceSpec;
    assets: StudioRenderAssets;
    look: StudioProductLook;
    isCancelled: () => boolean;
    /** Mug: turn towards the customer's photos / texts instead of the middle of the wrap. */
    turnToContent?: boolean;
  },
): Promise<string | null> {
  const run = async (): Promise<string | null> => {
    const hit = cachedPicture(key);
    if (hit) return hit;
    if (opts.isCancelled()) return null;
    await idle();
    if (opts.isCancelled()) return null;
    const doc: StudioDoc = await make();
    if (opts.isCancelled()) return null;
    const out = document.createElement("canvas");
    scratchCanvas ??= document.createElement("canvas");
    const m = opts.look.mug;
    const center: number | undefined =
      m && opts.turnToContent
        ? bestMugViewCenter(doc.surfaces[0]?.layers ?? [], opts.spec.widthMm, ((m.shape.topDiameterCm + m.shape.bottomDiameterCm) / 4) * 10)
        : undefined;
    drawProductPicture(out, opts.w, opts.h, doc, opts.spec, opts.assets, opts.look, scratchCanvas, PICTURE_BG, center);
    const url: string = out.toDataURL("image/jpeg", 0.86);
    if (photosReady(doc, opts.assets)) remember(key, url);
    return url;
  };
  const p = queue.then(run, run);
  queue = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

/** Device pixels for a CSS width: at most 2× (phones), never 0. */
export function pictureSize(cssW: number, aspect: number): { w: number; h: number } {
  const dpr: number = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const w: number = Math.max(80, Math.round(cssW * dpr));
  return { w, h: Math.round(w / aspect) };
}

/**
 * Live picture of a document (the «Personalizează» preview): redrawn on the
 * next frame after a change, at its CSS width × 2 at most.
 */
export function StudioLivePicture({
  doc,
  spec,
  assets,
  look,
  version,
  className,
  label,
  centerMm,
}: {
  doc: StudioDoc;
  spec: StudioSurfaceSpec;
  assets: StudioRenderAssets;
  look: StudioProductLook;
  version: number;
  className?: string;
  label: string;
  centerMm?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const [cssW, setCssW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setCssW(el.clientWidth);
    on();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || cssW <= 0) return;
    const id = window.requestAnimationFrame(() => {
      const { w, h } = pictureSize(cssW, PICTURE_ASPECT[look.kind]);
      scratch.current ??= document.createElement("canvas");
      drawProductPicture(el, w, h, doc, spec, assets, look, scratch.current, PICTURE_BG, centerMm);
    });
    return () => window.cancelAnimationFrame(id);
  }, [doc, spec, assets, look, version, cssW, centerMm]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      data-studio-live-picture
      className={`block w-full rounded-2xl ${className ?? ""}`}
      style={{
        aspectRatio: String(PICTURE_ASPECT[look.kind]),
        background: PICTURE_BG,
      }}
    />
  );
}
