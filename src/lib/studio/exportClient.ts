"use client";

import { exportCanvasAsBlob } from "@/lib/mug/exportLayout";
import type { StudioDoc } from "./document";
import { prepareStudioFonts } from "./fonts";
import { drawPrintArea, type StudioRenderAssets } from "./render";
import type { StudioSurfaceSpec } from "./surfaces";

/**
 * Studio outputs in the browser: the 300 dpi print PNG (same pixel size, dpi
 * and pHYs chunk as the old editors), small preview canvases for the 3D
 * texture and thumbnails. Fonts are awaited before the print file is drawn.
 */

export { prepareStudioFonts };

/** Draw a surface into `canvas` at `pxW × pxH` covering the print area exactly. */
function paint(canvas: HTMLCanvasElement, doc: StudioDoc, spec: StudioSurfaceSpec, assets: StudioRenderAssets, pxW: number, pxH: number, placeholders: boolean, asPrinted: boolean): void {
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const surface = doc.surfaces.find((s) => s.id === spec.id) ?? doc.surfaces[0]!;
  drawPrintArea(ctx, surface, spec, assets, pxW, pxH, { placeholders, asPrinted });
}

/**
 * Small canvas of a surface (live 3D texture, cross-sell), long side
 * `maxSidePx`. Pass the same canvas again to redraw in place (the 3D
 * `CanvasTexture` keeps pointing at it).
 */
export function renderPreviewCanvas(
  doc: StudioDoc,
  spec: StudioSurfaceSpec,
  assets: StudioRenderAssets,
  maxSidePx = 1024,
  into?: HTMLCanvasElement | null,
  /** Exactly what is printed (business cards: without untouched sample texts), not the template look. */
  asPrinted = false,
): HTMLCanvasElement {
  const canvas: HTMLCanvasElement = into ?? document.createElement("canvas");
  const k: number = maxSidePx / Math.max(spec.widthMm, spec.heightMm);
  paint(canvas, doc, spec, assets, Math.max(1, Math.round(spec.widthMm * k)), Math.max(1, Math.round(spec.heightMm * k)), false, asPrinted);
  return canvas;
}

/** Full-resolution canvas of the print file (pxW × pxH of the spec). */
export async function renderSurfaceCanvas(doc: StudioDoc, spec: StudioSurfaceSpec, assets: StudioRenderAssets): Promise<HTMLCanvasElement> {
  await prepareStudioFonts(doc);
  const canvas = document.createElement("canvas");
  paint(canvas, doc, spec, assets, spec.pxW, spec.pxH, false, true);
  return canvas;
}

/** The print PNG: print area at the catalog dpi, dpi written into the file. */
export async function exportStudioPng(doc: StudioDoc, spec: StudioSurfaceSpec, assets: StudioRenderAssets): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const canvas = await renderSurfaceCanvas(doc, spec, assets);
  const blob: Blob = await exportCanvasAsBlob(canvas, spec.dpi);
  return { blob, canvas };
}

/** Small JPEG data URL (≤ ~75 KB) of a canvas, white behind transparent areas (cart thumbnail). */
export function studioThumbnail(source: HTMLCanvasElement, maxSide = 320, background = "#ffffff"): string | null {
  try {
    const scale: number = Math.min(1, maxSide / Math.max(source.width, source.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(source.width * scale));
    c.height = Math.max(1, Math.round(source.height * scale));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.65, 0.5]) {
      const url: string = c.toDataURL("image/jpeg", q);
      if (url.length <= 75_000) return url;
    }
    return null;
  } catch {
    return null;
  }
}
