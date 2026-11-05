import { colorDistance, PALETTE_MIN_DISTANCE } from "@/lib/editor/editorPalette";
import {
  fitDocToSurfaces,
  layerBounds,
  mmToPt,
  ptToMm,
  studioId,
  type Rect,
  type StudioDoc,
  type StudioImageLayer,
  type StudioKind,
  type StudioLayer,
  type StudioSurface,
  type StudioTextLayer,
} from "./document";
import { INK_LIGHT, isHardToRead, isNearWhite, readableInk } from "./contrast";
import { surfaceBase, type StudioSurfaceSpec } from "./surfaces";

/**
 * «Designul tău pe alte produse»: the same design moved onto another product.
 * Pure.
 *
 * - Same orientation (mug ↔ mug of another size, notebook ↔ notebook):
 *   layers follow the area proportionally (`fitDocToSurfaces`).
 * - Landscape ↔ portrait (mug wrap ↔ notebook cover): the content is scaled
 *   as one group to fit inside the safe zone (and away from the mug handle)
 *   and centred; full-area backgrounds and full-width bands stretch to the
 *   new area instead.
 * - Onto the pen (a 40×15 mm strip): only the most important one or two texts
 *   (bound name / company / site first, else the largest) and a bound logo,
 *   in one or two lines; photos, QR codes (unreadable that small) and
 *   decorations are dropped.
 */

/** Smallest text the adapter writes (quality: below 5 pt is red). */
export const ADAPT_MIN_PT = 5.5;

type Orientation = "landscape" | "portrait" | "strip";

function orientation(kind: StudioKind, w: number, h: number): Orientation {
  if (kind === "pen") return "strip";
  return w >= h ? "landscape" : "portrait";
}

function withNewIds(layers: readonly StudioLayer[]): StudioLayer[] {
  return layers.map((l) => ({ ...l, id: studioId() }) as StudioLayer);
}

/** Uniform scale of a layer around the target origin: new = o + (old − from) · k. */
function moveScale(l: StudioLayer, from: { x: number; y: number }, o: { x: number; y: number }, k: number): StudioLayer {
  const base = { ...l, x: o.x + (l.x - from.x) * k, y: o.y + (l.y - from.y) * k, w: l.w * k, h: l.h * k };
  if (l.kind === "text") {
    let t: StudioTextLayer = {
      ...(base as StudioTextLayer),
      sizePt: l.sizePt * k,
      ...(l.stroke ? { stroke: { ...l.stroke, widthMm: Math.max(0.1, l.stroke.widthMm * k) } } : {}),
      ...(l.shadow ? { shadow: { ...l.shadow, blurMm: l.shadow.blurMm * k, dxMm: l.shadow.dxMm * k, dyMm: l.shadow.dyMm * k } } : {}),
    };
    // Never shrink text below the readable minimum: grow the box around its centre with it.
    const floor: number = Math.min(l.sizePt, ADAPT_MIN_PT);
    if (t.sizePt < floor) {
      const g: number = floor / t.sizePt;
      const cx: number = t.x + t.w / 2;
      const cy: number = t.y + t.h / 2;
      t = { ...t, sizePt: floor, w: t.w * g, h: t.h * g, x: cx - (t.w * g) / 2, y: cy - (t.h * g) / 2 };
    }
    return t;
  }
  if (l.kind === "image") {
    return { ...(base as StudioImageLayer), ...(l.frame ? { frame: { ...l.frame, widthMm: Math.max(0.1, l.frame.widthMm * k) } } : {}) };
  }
  if (l.kind === "shape") return { ...base, kind: "shape", ...(l.strokeMm ? { strokeMm: l.strokeMm * k } : {}) } as StudioLayer;
  return base as StudioLayer;
}

/** Horizontal margin of a target: safe zone, and on the mug the handle strips too. */
function sideMargin(spec: StudioSurfaceSpec): number {
  const handle: number = Math.max(0, ...spec.zones.map((z) => z.w));
  return Math.max(spec.safeMm, handle) + 1;
}

function regroup(src: StudioSurface, spec: StudioSurfaceSpec): StudioLayer[] {
  const W: number = src.widthMm;
  const H: number = src.heightMm;
  const isFullArea = (b: Rect) => b.w >= W * 0.9 && b.h >= H * 0.9;
  const isFullWidth = (l: StudioLayer, b: Rect) => l.kind === "shape" && b.w >= W * 0.9;
  const content: StudioLayer[] = [];
  const out: StudioLayer[] = [];
  for (const l of src.layers) {
    if (l.hidden) continue;
    const b: Rect = layerBounds(l);
    if (!isFullArea(b) && !isFullWidth(l, b)) content.push(l);
  }
  // Bounds of the real content (texts, photos, QR, small shapes).
  let box: Rect = { x: 0, y: 0, w: W, h: H };
  if (content.length) {
    const bs: Rect[] = content.map((l) => layerBounds(l));
    const x0: number = Math.min(...bs.map((b) => b.x));
    const y0: number = Math.min(...bs.map((b) => b.y));
    const x1: number = Math.max(...bs.map((b) => b.x + b.w));
    const y1: number = Math.max(...bs.map((b) => b.y + b.h));
    box = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }
  const mx: number = sideMargin(spec);
  const my: number = spec.safeMm + 1;
  const k: number = Math.min((spec.widthMm - 2 * mx) / box.w, (spec.heightMm - 2 * my) / box.h);
  const o = { x: (spec.widthMm - box.w * k) / 2, y: (spec.heightMm - box.h * k) / 2 };
  for (const l of src.layers) {
    if (l.hidden) continue;
    const b: Rect = layerBounds(l);
    if (isFullArea(b)) {
      out.push({ ...l, x: 0, y: 0, w: spec.widthMm, h: spec.heightMm, rotation: 0 } as StudioLayer);
    } else if (isFullWidth(l, b)) {
      // A band: full new width; its height and place follow the area height.
      const sy: number = spec.heightMm / H;
      out.push({ ...l, x: 0, w: spec.widthMm, y: l.y * sy, h: Math.max(0.5, l.h * Math.min(sy, k * 1.5)), rotation: 0 } as StudioLayer);
    } else {
      out.push(moveScale(l, { x: box.x, y: box.y }, o, k));
    }
  }
  return out;
}

/** Fill colour right under a point (topmost filled shape below `index`), else the surface background. */
function colourUnder(surface: StudioSurface, index: number, x: number, y: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const l = surface.layers[i]!;
    if (l.hidden || l.kind !== "shape" || !l.fill || (l.opacity ?? 1) < 0.5) continue;
    const b: Rect = layerBounds(l);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return l.fill;
  }
  return surface.background;
}

const PEN_PRIORITY: readonly (StudioTextLayer["bind"] | undefined)[] = ["name", "company", "site", "phone", "title"];

function textRank(t: StudioTextLayer): number {
  const p: number = t.bind ? PEN_PRIORITY.indexOf(t.bind) : -1;
  return p >= 0 ? 1000 - p : t.sizePt * Math.min(30, t.text.length) * 0.01;
}

function onPen(src: StudioSurface, spec: StudioSurfaceSpec): { layers: StudioLayer[]; background: string | null } {
  const texts: { t: StudioTextLayer; i: number }[] = src.layers
    .map((l, i) => ({ l, i }))
    .filter((x): x is { l: StudioTextLayer; i: number } => x.l.kind === "text" && !x.l.hidden && x.l.text.trim() !== "")
    .map(({ l, i }) => ({ t: l, i }));
  texts.sort((a, b) => textRank(b.t) - textRank(a.t));
  const logo: StudioImageLayer | undefined = src.layers.find(
    (l): l is StudioImageLayer => l.kind === "image" && l.bind === "logo" && !l.hidden && l.src != null,
  );
  const W: number = spec.widthMm;
  const H: number = spec.heightMm;
  const s: number = spec.safeMm;
  const ah: number = H - 2 * s;
  const layers: StudioLayer[] = [];
  let x0: number = s;
  if (logo) {
    const side: number = ah;
    layers.push({ ...logo, x: s, y: s, w: side, h: side, rotation: 0, frame: undefined });
    x0 = s + side + 1;
  }
  const aw: number = W - s - x0;
  const fitPt = (t: StudioTextLayer, lineH: number): number => {
    const byH: number = mmToPt((lineH / 1.2) * 0.95);
    const longest: number = Math.max(1, ...t.text.split("\n").map((x) => x.length));
    const byW: number = mmToPt(aw / (longest * 0.58));
    return Math.min(byH, byW);
  };
  let pick = texts.slice(0, 2);
  if (pick.length === 2 && pick.some((p) => fitPt({ ...p.t, text: p.t.text.split("\n")[0]! }, ah / 2) < ADAPT_MIN_PT)) pick = pick.slice(0, 1);
  const lineH: number = ah / Math.max(1, pick.length);
  // A white / cream background would print a white band over the pen's colour.
  let background: string | null = isNearWhite(src.background) ? null : src.background;
  pick.forEach(({ t, i }, n) => {
    const text: string = t.text.split("\n")[0]!;
    const sizePt: number = Math.max(ADAPT_MIN_PT, fitPt({ ...t, text }, lineH));
    const sizeMm: number = ptToMm(sizePt);
    layers.push({
      ...t,
      text,
      x: x0,
      y: s + n * lineH,
      w: aw,
      h: lineH,
      rotation: 0,
      sizePt: Math.round(sizePt * 10) / 10,
      align: logo ? "left" : "center",
      lineHeight: 1.2,
      arcDeg: undefined,
      shadow: undefined,
      ...(t.stroke ? { stroke: { ...t.stroke, widthMm: Math.max(0.1, Math.min(t.stroke.widthMm, sizeMm * 0.06)) } } : {}),
    });
    // White text that sat on a coloured band: the band colour becomes the pen background.
    if (n === 0 && !background) {
      const under: string | null = colourUnder(src, i, t.x + t.w / 2, t.y + t.h / 2);
      if (under && colorDistance(t.color, "#ffffff") < PALETTE_MIN_DISTANCE) background = under;
    }
  });
  // The band colour became the background: any picked text that is now hard to read takes white / navy.
  if (background && background !== src.background) {
    const bg: string = background;
    for (let k = 0; k < layers.length; k++) {
      const l: StudioLayer = layers[k]!;
      if (l.kind === "text" && isHardToRead(l.color, bg)) layers[k] = { ...l, color: readableInk(bg) };
    }
  }
  return { layers, background };
}

/** White or navy, whichever has the higher WCAG contrast on this colour (`readableInk`). */
export function contrastingInk(on: string): string {
  return readableInk(on);
}

/**
 * The adapted design on a product of another colour (a black pen, a red
 * cover) with no background of its own: texts that sit straight on the
 * product and would be hard to read on it (WCAG contrast below 3:1, e.g. navy
 * or grey on a dark-blue / red cover) switch to white or navy by the cover's
 * luminance; shapes that would blend into it likewise; a QR code gets a white
 * background instead (scanners want dark on light).
 */
export function recolorForProduct(surface: StudioSurface, productColorHex: string | null | undefined): StudioSurface {
  if (!productColorHex || surface.background) return surface;
  const product: string = productColorHex;
  let changed = false;
  const layers: StudioLayer[] = surface.layers.map((l, i) => {
    if (l.hidden) return l;
    const b: Rect = layerBounds(l);
    const under: string = colourUnder(surface, i, b.x + b.w / 2, b.y + b.h / 2) ?? product;
    if (under !== product) return l;
    const blends = (c: string | null | undefined): boolean => c != null && colorDistance(c, product) < PALETTE_MIN_DISTANCE;
    if (l.kind === "text" && (blends(l.color) || isHardToRead(l.color, product))) {
      changed = true;
      return { ...l, color: contrastingInk(product) };
    }
    if (l.kind === "shape" && (blends(l.fill) || (!l.fill && blends(l.stroke)))) {
      changed = true;
      const ink: string = contrastingInk(product);
      return { ...l, ...(l.fill ? { fill: ink } : {}), ...(l.stroke && blends(l.stroke) ? { stroke: ink } : {}) };
    }
    // A QR straight on a dark product: its light modules would be dark too.
    if (l.kind === "qr" && !l.background && (blends(l.color) || readableInk(product) === INK_LIGHT)) {
      changed = true;
      return { ...l, background: INK_LIGHT, ...(isHardToRead(l.color, INK_LIGHT) ? { color: "#000000" } : {}) };
    }
    return l;
  });
  return changed ? { ...surface, layers } : surface;
}

export interface AdaptOptions {
  /** Body / cover colour of the target product (what shows where the design is transparent). */
  productColorHex?: string | null;
}

/** The same design on another product (`toSpecs` = that product's surfaces). */
export function adaptStudioDoc(
  doc: StudioDoc,
  toKind: StudioKind,
  toSpecs: readonly StudioSurfaceSpec[],
  opts: AdaptOptions = {},
): StudioDoc {
  const src: StudioSurface = doc.surfaces[0]!;
  const spec: StudioSurfaceSpec = toSpecs[0]!;
  const from: Orientation = orientation(doc.kind, src.widthMm, src.heightMm);
  const to: Orientation = orientation(toKind, spec.widthMm, spec.heightMm);
  let surfaces: StudioSurface[];
  if (from === to) {
    surfaces = fitDocToSurfaces(doc, toSpecs.map(surfaceBase)).surfaces;
  } else if (to === "strip") {
    const p = onPen(src, spec);
    surfaces = [{ ...surfaceBase(spec), background: p.background, layers: p.layers }];
  } else {
    surfaces = [{ ...surfaceBase(spec), background: src.background, layers: regroup(src, spec) }];
  }
  return {
    ...doc,
    id: studioId("d"),
    kind: toKind,
    surfaces: surfaces.map((s) => {
      const r: StudioSurface = recolorForProduct(s, opts.productColorHex);
      return { ...r, layers: withNewIds(r.layers) };
    }),
  };
}
