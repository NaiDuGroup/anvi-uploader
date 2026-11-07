"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StudioDoc, StudioKind } from "@/lib/studio/document";
import { renderPreviewCanvas } from "@/lib/studio/exportClient";
import { studioMugLook, mugLookKey, type StudioMugLook } from "@/lib/studio/mugLook";
import { bestMugViewCenter, drawMugMockup, drawPenMockup } from "@/lib/studio/productMockup";
import type { StudioRenderAssets } from "@/lib/studio/render";
import type { StudioPenShape } from "@/lib/studio/penZone";
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
  card: 1.6,
  // Flyers: portrait sheets (A5 ≈ 0.7).
  flyer: 0.75,
};

/**
 * A business card as it comes off the cutter: the file cropped to the cut
 * line (`bleedMm` off every side), on the background with a soft shadow.
 */
function drawTrimmedCard(ctx: CanvasRenderingContext2D, w: number, h: number, design: HTMLCanvasElement, spec: StudioSurfaceSpec, background: string | null, fill = 0.86): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = background ?? "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const kx: number = design.width / spec.widthMm;
  const ky: number = design.height / spec.heightMm;
  const sx: number = spec.bleedMm * kx;
  const sy: number = spec.bleedMm * ky;
  const sw: number = design.width - sx * 2;
  const sh: number = design.height - sy * 2;
  const k: number = Math.min((w * fill) / sw, (h * fill) / sh);
  const dw: number = sw * k;
  const dh: number = sh * k;
  const x: number = (w - dw) / 2;
  const y: number = (h - dh) / 2;
  ctx.shadowColor = "rgba(20,33,61,0.25)";
  ctx.shadowBlur = Math.round(w * 0.03);
  ctx.shadowOffsetY = Math.round(w * 0.01);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, dw, dh);
  ctx.shadowColor = "transparent";
  ctx.drawImage(design, sx, sy, sw, sh, x, y, dw, dh);
}
export const PICTURE_BG = "#f3f1ee";

export interface StudioProductLook {
  kind: StudioKind;
  mug: StudioMugLook | null;
  /** Pen body / notebook cover colour. */
  color: string;
  /** Pen products: a pen, a pencil (PARTAS) or a set printed on its case (KIOTO). */
  penShape?: StudioPenShape;
  key: string;
}

/** The product look of the editor's current variant (mug parts / finish, pen or cover colour). */
export function useStudioProductLook(api: Pick<StudioEditorApi, "kind" | "item" | "variant" | "productColor"> & { product?: Pick<StudioEditorApi["product"], "studioPenShape"> }): StudioProductLook {
  const { kind, item, variant, productColor } = api;
  const penShape: StudioPenShape = api.product?.studioPenShape ?? "pen";
  return useMemo(() => {
    const color: string = productColor ?? "#ffffff";
    if (kind === "pen") return { kind, mug: null, color, penShape, key: `pen:${penShape}:${color}` };
    if (kind !== "mug") return { kind, mug: null, color, key: `${kind}:${color}` };
    const mug: StudioMugLook = studioMugLook(item, {
      variantHex: variant?.hex ?? null,
    });
    return { kind, mug, color, key: `mug:${mugLookKey(mug)}` };
  }, [kind, item, variant?.hex, productColor, penShape]);
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
  /** Business card: share of the picture the cut card fills (1 = the card alone, edge to edge). */
  cardFill = 0.86,
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
    drawPenMockup(ctx, w, h, design, print, look.color, background, look.penShape ?? "pen");
    return;
  }
  if (look.kind === "card" || look.kind === "flyer") {
    // Template thumbnails show the samples (what the layout looks like filled in).
    const design = renderPreviewCanvas(doc, spec, assets, Math.ceil(Math.max(w, h) * 1.1), scratch);
    drawTrimmedCard(ctx, w, h, design, spec, background, cardFill);
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

/**
 * Cart thumbnail as a small JPEG data URL: a mug with the print on it, a pen's
 * print area on the barrel colour; null for other products (the caller keeps
 * the flat print). The bare print of a pen in white ink was invisible on the
 * cart's light background.
 */
export function productThumbnail(
  design: HTMLCanvasElement,
  spec: StudioSurfaceSpec,
  look: StudioProductLook,
  doc: StudioDoc,
  width = 320,
  qualities: readonly number[] = [0.85, 0.7, 0.55],
): string | null {
  if (look.kind === "notebook" || (look.kind === "mug" && !look.mug)) return null;
  try {
    const c = document.createElement("canvas");
    if (look.kind === "card" || look.kind === "flyer") {
      // The front as cut, on the cart's white.
      c.width = width;
      c.height = Math.round(width / PICTURE_ASPECT[look.kind]);
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      drawTrimmedCard(ctx, c.width, c.height, design, spec, "#ffffff", 0.92);
      for (const q of qualities) {
        const url: string = c.toDataURL("image/jpeg", q);
        if (url.length <= 75_000) return url;
      }
      return null;
    }
    const print = { widthMm: spec.widthMm, heightMm: spec.heightMm };
    if (look.kind === "mug" && look.mug) {
      c.width = width;
      c.height = Math.round(width / PICTURE_ASPECT.mug);
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      const radiusMm: number = ((look.mug.shape.topDiameterCm + look.mug.shape.bottomDiameterCm) / 4) * 10;
      drawMugMockup(ctx, c.width, c.height, design, print, look.mug, "#ffffff", bestMugViewCenter(doc.surfaces[0]?.layers ?? [], spec.widthMm, radiusMm));
    } else {
      // A whole pen is too thin to read in a cart thumbnail: the print area on the barrel colour, like the magnified view.
      const pad: number = Math.round(width * 0.06);
      const dw: number = width - pad * 2;
      const dh: number = Math.round((dw * print.heightMm) / print.widthMm);
      c.width = width;
      c.height = dh + pad * 2;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = look.color;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(design, pad, pad, dw, dh);
    }
    for (const q of qualities) {
      const url: string = c.toDataURL("image/jpeg", q);
      if (url.length <= 75_000) return url;
    }
    return null;
  } catch {
    return null;
  }
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
    /** Business card: share of the picture the cut card fills (1 = the card alone). */
    cardFill?: number;
    /** Asked after drawing: false keeps the picture out of the cache (e.g. drawn before its fonts arrived). */
    cacheable?: () => boolean;
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
    drawProductPicture(out, opts.w, opts.h, doc, opts.spec, opts.assets, opts.look, scratchCanvas, PICTURE_BG, center, opts.cardFill);
    const url: string = out.toDataURL("image/jpeg", 0.86);
    if (photosReady(doc, opts.assets) && (opts.cacheable?.() ?? true)) remember(key, url);
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
