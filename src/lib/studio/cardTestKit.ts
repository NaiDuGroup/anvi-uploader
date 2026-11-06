import path from "node:path";
import { GlobalFonts, Path2D as NapiPath2D, createCanvas } from "@napi-rs/canvas";
import type { StudioDoc, StudioTextLayer } from "./document";
import { drawPrintArea, measureTextBox, type StudioRenderAssets } from "./render";
import type { StudioSurfaceSpec } from "./surfaces";
import type { MeasureText } from "./textFit";

/**
 * Node-only helpers for business-card tests and the template contact sheet:
 * the self-hosted Studio fonts registered with the node canvas (real text
 * widths, the same files the shop serves), a text measure and a renderer.
 * Not imported by app code.
 */

const FONT_FILES: Record<string, string[]> = {
  Roboto: ["roboto/Roboto-wght.woff2"],
  "Open Sans": ["opensans/OpenSans-wght.woff2"],
  Montserrat: ["montserrat/Montserrat-wght.woff2"],
  Oswald: ["oswald/Oswald-wght.woff2"],
  Comfortaa: ["comfortaa/Comfortaa-wght.woff2"],
  "Playfair Display": ["playfairdisplay/PlayfairDisplay-wght.woff2"],
  Merriweather: ["merriweather/Merriweather-wght.woff2"],
  "Cormorant Garamond": ["cormorantgaramond/CormorantGaramond-wght.woff2", "cormorantgaramond/CormorantGaramond-Italic-wght.woff2"],
  Lobster: ["lobster/Lobster-Regular.woff2"],
  Caveat: ["caveat/Caveat-wght.woff2"],
};

let registered = false;

/** Register the Studio template fonts (and Path2D) with the node canvas, once. */
export function registerCardFonts(root: string = process.cwd()): void {
  (globalThis as { Path2D?: unknown }).Path2D ??= NapiPath2D;
  if (registered) return;
  registered = true;
  for (const [family, files] of Object.entries(FONT_FILES)) for (const f of files) GlobalFonts.registerFromPath(path.join(root, "src/fonts", f), family);
}

export const nodeAssets: StudioRenderAssets = { image: () => null, font: (f) => f };

const measureCtx = () => createCanvas(10, 10).getContext("2d") as unknown as CanvasRenderingContext2D;
let mctx: CanvasRenderingContext2D | null = null;

/** Text box measured with the real fonts (registers them first). */
export const nodeMeasure: MeasureText = (layer: StudioTextLayer) => {
  registerCardFonts();
  mctx ??= measureCtx();
  return measureTextBox(mctx, layer, (f) => f);
};

/** One side as a PNG (`asPrinted`: samples left out, like the print file). */
export function renderCardSide(doc: StudioDoc, spec: StudioSurfaceSpec, opts: { asPrinted?: boolean; widthPx?: number; assets?: StudioRenderAssets } = {}): Buffer {
  registerCardFonts();
  const w: number = opts.widthPx ?? spec.pxW;
  const h: number = Math.round((w * spec.heightMm) / spec.widthMm);
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const surface = doc.surfaces.find((s) => s.id === spec.id);
  if (surface) drawPrintArea(ctx, surface, spec, opts.assets ?? nodeAssets, w, h, { asPrinted: opts.asPrinted ?? false });
  return c.encodeSync("png");
}
