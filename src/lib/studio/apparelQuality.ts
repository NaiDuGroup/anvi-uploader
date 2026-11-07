import { MM_PER_PT, imageEffectiveDpi, layerBounds, rectsIntersect, type StudioDoc, type StudioImageLayer, type StudioLayer } from "./document";
import { isApparelSampleText } from "./apparel";
import { evaluateStudioQuality, type StudioQualityItem, type StudioQualityOptions } from "./quality";
import type { StudioSurfaceSpec } from "./surfaces";
import { textInkBox } from "./textFit";

/**
 * Print checks of a DTF apparel design (`apparel`), on top of the Studio's
 * own («Semafor», quality.ts). DTF prints exactly what the transfer holds, at
 * its real size, on fabric:
 *
 * - a photo below 150 dpi at the printed size → yellow (nothing blocks on dpi);
 * - an image whose edges are opaque (a JPEG, a PNG with a white box) prints
 *   that box on the garment → yellow, with «Elimină fundalul» in the editor;
 * - lines thinner than 1 mm and letters under ~2 mm cap height may not
 *   transfer → yellow;
 * - anything touching / crossing the zone edge is cut there → yellow;
 * - a sample text («Textul tău») left unchanged prints as it is → yellow, naming the zone.
 *
 * An empty zone is simply not printed: only a design with nothing on any
 * zone is red. Pure.
 */

export const APPAREL_DPI_WARN = 150;
export const APPAREL_THIN_LINE_MM = 1;
/** Text outlines thinner than this get lost in the fabric. */
export const APPAREL_THIN_OUTLINE_MM = 0.5;
export const APPAREL_CAP_HEIGHT_MM = 2;
/** Cap height of a typical face as a share of the point size. */
export const CAP_HEIGHT_SHARE = 0.7;
/** Closer to the zone edge than this (mm) counts as touching it. */
export const APPAREL_EDGE_MM = 0.5;

/** Cap height (mm) of a text set at `sizePt`. */
export function capHeightMm(sizePt: number): number {
  return sizePt * MM_PER_PT * CAP_HEIGHT_SHARE;
}

export interface ApparelQualityOptions extends StudioQualityOptions {
  /** Zones printed (with something on them); the others are left out of the checks. */
  used: readonly string[];
  /** The image's edges are opaque (its background prints). Without it: JPEG / other non-PNG sources count as opaque. */
  opaqueImage?: (layer: StudioImageLayer) => boolean | null;
  /** Zone name in the shop language («Față»), for the sample-text warning. */
  zoneName?: (surfaceId: string) => string;
}

/** Codes of the base checks replaced here by their DTF version (or not relevant on a transfer). */
const REPLACED = new Set(["textPlaceholder", "photoDpi", "textTiny", "outlineThin", "trim", "safeZone", "bleedShort", "designEmpty", "seam", "handle", "neonRgb"]);

/** An image source that cannot hold transparency. */
export function imageMimeOpaque(layer: StudioImageLayer): boolean {
  const mime: string = (layer.src?.mime ?? "").toLowerCase();
  return mime !== "" && mime !== "image/png" && mime !== "image/webp" && mime !== "image/gif" && mime !== "image/svg+xml";
}

function thinLine(l: StudioLayer): boolean {
  if (l.kind === "shape") {
    if (l.shape === "line") return Math.min(l.w, l.h) < APPAREL_THIN_LINE_MM;
    // An outline-only figure: its stroke is the drawing.
    const sw: number = l.strokeMm ?? 0;
    return l.stroke != null && sw > 0 && sw < APPAREL_THIN_LINE_MM;
  }
  if (l.kind === "text") return !!l.stroke && l.stroke.widthMm > 0 && l.stroke.widthMm < APPAREL_THIN_OUTLINE_MM;
  return false;
}

export function evaluateApparelQuality(doc: StudioDoc, specs: readonly StudioSurfaceSpec[], opts: ApparelQualityOptions): StudioQualityItem[] {
  const used = new Set(opts.used);
  const out: StudioQualityItem[] = evaluateStudioQuality(doc, specs, opts).filter((i) => !REPLACED.has(i.code) && (!i.surfaceId || used.has(i.surfaceId)));
  if (used.size === 0) {
    out.unshift({ id: `designEmpty:${doc.surfaces[0]?.id ?? "front"}`, level: "red", code: "designEmpty", surfaceId: doc.surfaces[0]?.id ?? "front" });
    return out;
  }
  for (const surface of doc.surfaces) {
    if (!used.has(surface.id)) continue;
    const W: number = surface.widthMm;
    const H: number = surface.heightMm;
    const add = (code: StudioQualityItem["code"], l: StudioLayer, vars?: StudioQualityItem["vars"]) =>
      out.push({ id: `${code}:${l.id}`, level: "yellow", code, layerId: l.id, surfaceId: surface.id, ...(vars ? { vars } : {}) });
    for (const l of surface.layers) {
      if (l.hidden) continue;
      if (l.kind === "text" && l.text.trim() === "") continue;
      // Never dropped: a sample text left as it is prints — say so, naming the zone.
      if (l.kind === "text" && isApparelSampleText(l)) add("dtfSampleText", l, { zone: opts.zoneName?.(surface.id) ?? surface.id, text: l.text.trim().slice(0, 40) });
      if (l.kind === "image" && l.src) {
        const dpi: number | null = imageEffectiveDpi(l);
        if (dpi != null && dpi < APPAREL_DPI_WARN) add("dtfPhotoDpi", l, { dpi: Math.round(dpi) });
        const opaque: boolean | null = opts.opaqueImage?.(l) ?? null;
        if (opaque ?? imageMimeOpaque(l)) add("dtfOpaqueBg", l);
      }
      if (l.kind === "text" && capHeightMm(l.sizePt) < APPAREL_CAP_HEIGHT_MM - 1e-9) add("dtfSmallText", l, { pt: Math.round(l.sizePt * 10) / 10 });
      if (thinLine(l)) add("dtfThinLine", l);
      const b = l.kind === "text" && !l.rotation ? textInkBox(l) : layerBounds(l);
      if (rectsIntersect(b, { x: 0, y: 0, w: W, h: H })) {
        const sides: number[] = [b.x, b.y, W - (b.x + b.w), H - (b.y + b.h)];
        if (sides.some((d) => d < APPAREL_EDGE_MM)) add("dtfEdge", l);
      }
    }
  }
  return out;
}

// ─── Image background (pixels) ───────────────────────────────────────────

/** Share (0…1) of the image's edge pixels that are opaque: a full box will print around the artwork. */
export function opaqueEdgeShare(data: Uint8ClampedArray, w: number, h: number): number {
  if (w < 1 || h < 1) return 0;
  let n = 0;
  let opaque = 0;
  const step: number = Math.max(1, Math.floor(Math.max(w, h) / 200));
  const at = (x: number, y: number) => {
    n++;
    if (data[(y * w + x) * 4 + 3]! > 240) opaque++;
  };
  for (let x = 0; x < w; x += step) {
    at(x, 0);
    at(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    at(0, y);
    at(w - 1, y);
  }
  return n ? opaque / n : 0;
}

/** Opaque all around the edge (≥ 95 % of the edge pixels): its background will print. */
export function hasOpaqueEdges(data: Uint8ClampedArray, w: number, h: number): boolean {
  return opaqueEdgeShare(data, w, h) >= 0.95;
}

function colorDist(data: Uint8ClampedArray, i: number, r: number, g: number, b: number): number {
  const dr: number = data[i]! - r;
  const dg: number = data[i + 1]! - g;
  const db: number = data[i + 2]! - b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** The most common colour along the edge (quantised), as the background to remove. */
export function edgeBackgroundColor(data: Uint8ClampedArray, w: number, h: number): [number, number, number] | null {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  const visit = (x: number, y: number) => {
    const i: number = (y * w + x) * 4;
    if (data[i + 3]! < 200) return;
    const key: number = ((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4);
    const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += data[i]!;
    c.g += data[i + 1]!;
    c.b += data[i + 2]!;
    counts.set(key, c);
  };
  for (let x = 0; x < w; x++) {
    visit(x, 0);
    visit(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    visit(0, y);
    visit(w - 1, y);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best ? [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)] : null;
}

/**
 * Remove a flat background (white, or any one colour) the way a print
 * operator would with a magic wand: flood fill from the edges over pixels
 * within `tolerance` (RGB distance) of the edge colour, made transparent;
 * pixels just above the tolerance (the anti-aliased rim) fade out. Islands
 * of the colour inside the artwork (the counter of an «O») are kept. In place;
 * returns the share of pixels removed (0…1).
 */
export function removeFlatBackground(data: Uint8ClampedArray, w: number, h: number, tolerance = 40): number {
  const bg = edgeBackgroundColor(data, w, h);
  if (!bg) return 0;
  const [r, g, b] = bg;
  const soft: number = tolerance * 1.6;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p: number = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  let removed = 0;
  while (stack.length) {
    const p: number = stack.pop()!;
    const i: number = p * 4;
    const a: number = data[i + 3]!;
    const d: number = a === 0 ? 0 : colorDist(data, i, r, g, b);
    if (d > soft) continue;
    if (d <= tolerance) {
      if (a !== 0) removed++;
      data[i + 3] = 0;
    } else {
      // The rim: partly background, fades with the distance.
      data[i + 3] = Math.round(a * ((d - tolerance) / (soft - tolerance)));
      continue;
    }
    const x: number = p % w;
    const y: number = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return removed / (w * h);
}
