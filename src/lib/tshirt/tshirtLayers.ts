/**
 * Layers of the client t-shirt designer and the maths shared by the editor,
 * the preview and the print-file renderer. Units: cm, origin = top-left of the
 * side's print area, (cx, cy) = layer centre.
 */
import { anchorTopCm, sizeRatio, TSHIRT_REFERENCE_SIZE, type PrintArea, type TshirtSide } from "./tshirtRules";

export type TextLayer = {
  id: string;
  kind: "text";
  cx: number;
  cy: number;
  rotation: number;
  text: string;
  fontId: string;
  color: string;
  /** Font size in cm (≈ letter height). */
  sizeCm: number;
  bold: boolean;
  /** Line width in cm the text wraps at (set automatically when it doesn't fit on one line). */
  wrapCm?: number;
};

export type ImageLayer = {
  id: string;
  kind: "image";
  cx: number;
  cy: number;
  rotation: number;
  /** Browser object URL while designing. */
  src: string;
  /** Storage key of the original, set when the order is sent. */
  srcKey?: string;
  fileName: string;
  naturalW: number;
  naturalH: number;
  widthCm: number;
  /** SVG: drawn sharp at any size, so no resolution check. */
  vector?: boolean;
};

export type Layer = TextLayer | ImageLayer;

export const TEXT_LINE_HEIGHT = 1.2;

/** Text width in cm from a canvas measure (`measure(line, fontPx)` → px). */
/** Width in px of `line` drawn at `fontPx` in this layer's font. */
export type Measure = (line: string, fontPx: number, layer: TextLayer) => number;

/** Lines as printed: the client's own line breaks, plus automatic wrapping at `wrapCm`. */
export function textLines(layer: TextLayer, measure: Measure): string[] {
  const paragraphs = layer.text.split("\n");
  if (!layer.wrapCm) return paragraphs;
  const px = 200;
  const widthCm = (str: string) => (measure(str, px, layer) / px) * layer.sizeCm;
  const out: string[] = [];
  const max = layer.wrapCm + 1e-6;
  /** A word wider than the line is cut into pieces that fit (long names, links, "aaaaaa…"). */
  const pieces = (word: string): string[] => {
    if (widthCm(word) <= max) return [word];
    const chars = [...word];
    const res: string[] = [];
    let cur = "";
    for (const ch of chars) {
      if (cur && widthCm(cur + ch) > max) {
        res.push(cur);
        cur = ch;
      } else cur += ch;
    }
    if (cur) res.push(cur);
    return res;
  };
  for (const para of paragraphs) {
    const words = para.split(/ +/).filter(Boolean).flatMap(pieces);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = words[0]!;
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (widthCm(next) <= max) line = next;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

export function textBoxCm(layer: TextLayer, measure: Measure): { w: number; h: number } {
  const lines = textLines(layer, measure);
  const px = 200;
  const widest = Math.max(...lines.map((l) => measure(l || " ", px, layer)));
  return { w: Math.max(0.5, (widest / px) * layer.sizeCm), h: lines.length * layer.sizeCm * TEXT_LINE_HEIGHT };
}

export function layerBoxCm(layer: Layer, measure: Measure): { w: number; h: number } {
  if (layer.kind === "image") return { w: layer.widthCm, h: (layer.widthCm * layer.naturalH) / layer.naturalW };
  return textBoxCm(layer, measure);
}

/** Corners of the rotated layer box, in print-area cm. */
export function layerCorners(layer: Layer, box: { w: number; h: number }): [number, number][] {
  const r = (layer.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [-box.w / 2, -box.h / 2],
    [box.w / 2, -box.h / 2],
    [box.w / 2, box.h / 2],
    [-box.w / 2, box.h / 2],
  ].map(([x, y]) => [layer.cx + x * c - y * s, layer.cy + x * s + y * c] as [number, number]);
}

export type SideBounds = { x: number; y: number; w: number; h: number; outside: boolean } | null;

/** Bounding box of everything on a side (clamped to the print area) + whether something sticks out. */
export function sideBounds(area: PrintArea, layers: Layer[], measure: Measure): SideBounds {
  if (layers.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of layers) {
    for (const [x, y] of layerCorners(l, layerBoxCm(l, measure))) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  const eps = 0.05;
  const outside = x0 < -eps || y0 < -eps || x1 > area.maxWidthCm + eps || y1 > area.maxHeightCm + eps;
  const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0);
  const cx1 = Math.min(area.maxWidthCm, x1), cy1 = Math.min(area.maxHeightCm, y1);
  return { x: cx0, y: cy0, w: Math.max(0, cx1 - cx0), h: Math.max(0, cy1 - cy0), outside };
}

/** Round a size up to 0.1 cm (what we print and price). */
export function ceilCm(v: number): number {
  return Math.ceil(v * 10 - 1e-6) / 10;
}

/**
 * Keep a layer fully inside the print area: shrink it (keeping its
 * proportions) if its rotated box is bigger than the area, then push its centre
 * back so no corner sticks out. Used on every move, resize, rotation and edit,
 * so a design can never leave the print area.
 */
export function clampLayerToArea<L extends Layer>(layer: L, area: PrintArea, measure: Measure): L {
  const r = (layer.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const extents = (l: Layer) => {
    const box = layerBoxCm(l, measure);
    return { ex: (box.w * c + box.h * s) / 2, ey: (box.w * s + box.h * c) / 2 };
  };

  let out: L = layer;
  let { ex, ey } = extents(out);
  const fit = Math.min(1, area.maxWidthCm / (2 * ex), area.maxHeightCm / (2 * ey));
  if (fit < 1) {
    // Round down to 0.1 so the shrunk layer really fits.
    out =
      out.kind === "image"
        ? ({ ...out, widthCm: Math.floor(out.widthCm * fit * 10) / 10 } as L)
        : ({ ...out, sizeCm: Math.floor((out as TextLayer).sizeCm * fit * 10) / 10 } as L);
    ({ ex, ey } = extents(out));
  }
  const cx = Math.min(Math.max(out.cx, ex), area.maxWidthCm - ex);
  const cy = Math.min(Math.max(out.cy, ey), area.maxHeightCm - ey);
  return cx === out.cx && cy === out.cy ? out : ({ ...out, cx, cy } as L);
}

/**
 * The design scaled by `k` around the side's origin (HPS / the sleeve square's
 * top middle): positions and sizes together, as one picture.
 */
export function scaleLayers(layers: Layer[], k: number): Layer[] {
  return layers.map((l) => {
    const base = { ...l, cx: l.cx * k, cy: l.cy * k };
    if (base.kind === "image") return { ...base, widthCm: Math.round(base.widthCm * k * 1000) / 1000 };
    return { ...base, sizeCm: Math.round(base.sizeCm * k * 1000) / 1000, ...(base.wrapCm ? { wrapCm: Math.round(base.wrapCm * k * 1000) / 1000 } : {}) };
  });
}

/**
 * The design (kept on M) as it is printed on a size: scaled by the size's
 * ratio, keeping its distance from that size's standard start (under the
 * collar; a sleeve: the top of its square) in proportion — so on every shirt
 * it starts where a print normally starts and keeps its look.
 */
export function layersForSize(layers: Layer[], side: TshirtSide, size: string): Layer[] {
  const k = sizeRatio(size);
  const from = anchorTopCm(side, TSHIRT_REFERENCE_SIZE);
  const to = anchorTopCm(side, size);
  return scaleLayers(layers, k).map((l) => ({ ...l, cy: to + (l.cy / k - from) * k }));
}

/** The opposite of `layersForSize`: a design edited on a size, back on M. */
export function layersFromSize(layers: Layer[], side: TshirtSide, size: string): Layer[] {
  const k = sizeRatio(size);
  const from = anchorTopCm(side, TSHIRT_REFERENCE_SIZE);
  const to = anchorTopCm(side, size);
  return scaleLayers(layers, 1 / k).map((l) => ({ ...l, cy: from + (l.cy * k - to) / k }));
}
