/**
 * Where a design may sit on the t-shirt.
 *
 * Coordinates: cm, origin = top centre of the collar (the shoulder line at the
 * middle of the shirt), x to the right as you look at that side, y down.
 *
 * Rules:
 * - on the shirt body, inside the area of every ordered size (`bodyAreaCm`);
 * - everything on one side together at most the print size of the smallest
 *   ordered size (XS 24 × 32 … L+ 30 × 42 cm, one print file);
 * - a sleeve: inside its print square.
 */
import { fitsFrames, garmentCm, isSleeve, printAreaForSizes, sizePrintArea, TSHIRT_REFERENCE_SIZE, TSHIRT_PRINT_AREA, TSHIRT_SLEEVE_CM, type PrintArea, type TshirtSide } from "./tshirtRules";
import { ceilCm, layersForSize, scaleLayers, layerBoxCm, layerCorners, textBoxCm, textLines, type Layer, type Measure, type TextLayer } from "./tshirtLayers";

export const TSHIRT_EDGE_MARGIN_CM = 3;

export type Pt = [number, number];
/** Allowed area for one side: inside every outline, margin cm away from its edges. */
/**
 * Allowed area for one side: inside every outline, margin cm away from its
 * edges, and everything on the side together at most `max` (one print file).
 */
export type PrintRegion = { outlines: Pt[][]; margin: number; max: PrintArea };

// The flat drawing (TshirtShape): chest 52 cm = 260 units, 5 units per cm, collar top centre at (240, 30).
// lengthCm: the hem is curved, its lowest point (y 407) is the real shirt length.
const BASE = { chestCm: 52, lengthCm: 75.4, x: 240, y: 30, unitsPerCm: 5 };

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}
function quad(p0: Pt, p1: Pt, p2: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}

/** Shirt body outline (no sleeves) of one size, in cm from the collar. */
export function shirtOutlineCm(side: TshirtSide, size: string | null): Pt[] {
  const neck: [Pt, Pt] = side === "front" ? [[210, 72], [270, 72]] : [[212, 46], [268, 46]];
  const base: Pt[] = [
    [125, 42],
    [195, 30],
    ...cubic([195, 30], neck[0], neck[1], [285, 30], 16),
    [285, 30],
    [355, 42],
    [370, 146],
    [372, 402],
    ...quad([372, 402], [240, 412], [108, 402], 12),
    [108, 402],
    [110, 146],
  ];
  const g = garmentCm(size);
  const sx = g.chest / BASE.chestCm;
  const sy = g.length / BASE.lengthCm;
  return base.map(([x, y]) => [((x - BASE.x) * sx) / BASE.unitsPerCm, ((y - BASE.y) * sy) / BASE.unitsPerCm]);
}

/**
 * Allowed area for the ordered sizes (a design must fit on each of them).
 * A sleeve: its print square (`sleeveCm`, 10 × 10 cm), x centred, y from its
 * top edge — the same on every size; the square already sits inside the sleeve.
 */
export function regionForSizes(side: TshirtSide, sizes: readonly string[], sleeveCm: number = TSHIRT_SLEEVE_CM): PrintRegion {
  // The design is kept on M: where it may sit is M's area; how big it may be, so that every ordered size takes it.
  const max = printAreaForSizes(side, sizes, sleeveCm);
  if (isSleeve(side)) {
    const m = Math.min(sleeveCm, 10);
    const h = m / 2 + 0.001;
    const square: Pt[] = [
      [-h, -0.001],
      [h, -0.001],
      [h, m + 0.001],
      [-h, m + 0.001],
    ];
    return { outlines: [square], margin: 0, max };
  }
  return { outlines: [bodyAreaCm(side, [TSHIRT_REFERENCE_SIZE])], margin: 0, max };
}

/** Top of the area a design may sit in, under the HPS (cm): below the collar. */
export const TSHIRT_AREA_TOP: Record<"front" | "back", number> = { front: 11, back: 4 };

/**
 * Where a design may sit on the front / back of every ordered size (cm): a
 * rectangle on the shirt body, 5 cm in from the sides and down to 12 cm above
 * the hem of the smallest size. The design itself is at most the size's print
 * area (`printAreaForSizes`).
 */
export function bodyAreaCm(side: TshirtSide, sizes: readonly string[]): Pt[] {
  const list = sizes.length > 0 ? sizes : [null];
  const chest = Math.min(...list.map((s) => garmentCm(s).chest));
  const length = Math.min(...list.map((s) => garmentCm(s).length));
  const half = chest / 2 - 5;
  const top = TSHIRT_AREA_TOP[side === "back" ? "back" : "front"];
  const bottom = length - 12;
  return [
    [-half, top],
    [half, top],
    [half, bottom],
    [-half, bottom],
  ];
}

/** Where new designs go and where a design is pulled back to: middle of the chest (a sleeve: middle of its square). */
export function regionAnchor(side: TshirtSide, region: PrintRegion): Pt {
  if (!isSleeve(side)) return TSHIRT_ANCHOR[side as "front" | "back"];
  // A little under the square's middle: a sleeve print reads best lower on the sleeve.
  return [0, region.max.maxHeightCm * 0.6];
}

function inside(p: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distToEdges(p: Pt, poly: Pt[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]!;
    const [bx, by] = poly[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2));
    d = Math.min(d, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
  }
  return d;
}
export function pointAllowed(p: Pt, region: PrintRegion): boolean {
  return region.outlines.every((poly) => inside(p, poly) && distToEdges(p, poly) >= region.margin - 1e-6);
}

/** The whole rotated box of the layer is in the allowed area. */
export function layerInRegion(layer: Layer, region: PrintRegion, measure: Measure): boolean {
  const cs = layerCorners(layer, layerBoxCm(layer, measure));
  for (let i = 0; i < 4; i++) {
    const a = cs[i]!;
    const b = cs[(i + 1) % 4]!;
    const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      if (!pointAllowed([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], region)) return false;
    }
  }
  return true;
}

export type Bounds = { x: number; y: number; w: number; h: number };
/** Bounding box of everything on a side. */
export function layersBounds(layers: Layer[], measure: Measure): Bounds | null {
  if (layers.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of layers) {
    for (const [x, y] of layerCorners(l, layerBoxCm(l, measure))) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const TSHIRT_MAX_DESIGN = TSHIRT_PRINT_AREA.front; // 30 × 42 cm, front and back
/** The size we price and print is rounded up to 0.1 cm — that rounded size must fit (30 × 42; a sleeve 10 × 10). */
export function withinMaxSize(layers: Layer[], measure: Measure, max: PrintArea = TSHIRT_MAX_DESIGN): boolean {
  const b = layersBounds(layers, measure);
  return !b || fitsFrames(max, ceilCm(b.w), ceilCm(b.h), 1e-9);
}

/**
 * Safety net: a side a hair over 30 × 42 (e.g. made before this rule) is shrunk
 * just enough, around its own middle, so it can be priced and printed.
 */
export function shrinkToMaxSize(layers: Layer[], measure: Measure, max: PrintArea = TSHIRT_MAX_DESIGN): Layer[] {
  if (withinMaxSize(layers, measure, max)) return layers;
  const b = layersBounds(layers, measure)!;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // the frame it fits best (upright or lying down)
  const frames = max.frames ?? [{ w: max.maxWidthCm, h: max.maxHeightCm }];
  let f = Math.min(1, Math.max(...frames.map((fr) => Math.min((fr.w - 0.1) / b.w, (fr.h - 0.1) / b.h))));
  for (let i = 0; i < 20; i++) {
    const out = layers.map((l) => {
      const moved = { ...l, cx: cx + (l.cx - cx) * f, cy: cy + (l.cy - cy) * f };
      return withSize(moved, Math.floor(sizeOf(l) * f * 100) / 100);
    });
    if (withinMaxSize(out, measure, max)) return out;
    f *= 0.995;
  }
  return layers;
}

/** Where new designs go and where a design is pulled back to: middle of the chest. */
export const TSHIRT_ANCHOR: Record<"front" | "back", Pt> = { front: [0, 22], back: [0, 20] };

function sizeOf(l: Layer): number {
  return l.kind === "image" ? l.widthCm : l.sizeCm;
}
function withSize<L extends Layer>(l: L, v: number): L {
  return (l.kind === "image" ? { ...l, widthCm: v } : { ...l, sizeCm: v as TextLayer["sizeCm"] }) as L;
}
function lerpPos<L extends Layer>(a: L, b: L, t: number): L {
  return { ...b, cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t };
}

/** Narrowest change that makes the text fit: wrap it at ever smaller widths (widest first). */
function wrapToFit(layer: TextLayer, fit: (l: TextLayer) => TextLayer | null, measure: Measure): TextLayer | null {
  const natural = textBoxCm({ ...layer, wrapCm: undefined }, measure).w;
  let last = "";
  for (let w = natural * 0.98; w > 0.5; w *= 0.95) {
    const cand: TextLayer = { ...layer, wrapCm: Math.round(w * 10) / 10 };
    const lines = textLines(cand, measure);
    const key = lines.join("\n");
    if (key === last) continue;
    last = key;
    const placed = fit(cand);
    if (placed) return placed;
    // one letter per line already: wrapping can't help any more
    if (lines.every((l) => [...l].length <= 1)) break;
  }
  return null;
}

export type PlaceResult<L extends Layer> = { layer: L; hitMax: boolean };

/**
 * Apply a change to a layer while keeping every rule:
 * - a move slides along the edge instead of crossing it;
 * - growing stops where the layer touches the edge or the 30 × 42 limit;
 * - anything else that no longer fits (new text, a smaller size ordered) is
 *   pulled towards the chest, and shrunk only if it still doesn't fit.
 * `hitMax` tells the editor the 30 × 42 limit was what stopped it.
 */
export function placeLayer<L extends Layer>(
  prev: L | null,
  next: L,
  others: Layer[],
  side: TshirtSide,
  region: PrintRegion,
  measure: Measure,
): PlaceResult<L> {
  const inRegion = (l: L) => layerInRegion(l, region, measure);
  const inMax = (l: L) => withinMaxSize([...others, l], measure, region.max);
  const ok = (l: L) => inRegion(l) && inMax(l);
  // Text: on one line when it fits, otherwise wrapped as wide as the shirt allows.
  if (next.kind === "text") {
    const t = next as TextLayer;
    const changed =
      !prev ||
      prev.kind !== "text" ||
      prev.sizeCm !== t.sizeCm ||
      prev.text !== t.text ||
      prev.fontId !== t.fontId ||
      prev.bold !== t.bold ||
      prev.rotation !== t.rotation;
    if (changed) {
      const oneLine = { ...t, wrapCm: undefined } as L;
      if (ok(oneLine)) return { layer: oneLine, hitMax: false };
      // a wrapped text is taller: let it shift towards the chest if it touches an edge
      const nearby = (l: TextLayer): TextLayer | null => {
        if (ok(l as L)) return l;
        const a = { ...l, cx: regionAnchor(side, region)[0], cy: regionAnchor(side, region)[1] };
        if (!ok(a as L)) return null;
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (ok(lerpPos(l, a, mid) as L)) hi = mid;
          else lo = mid;
        }
        return lerpPos(l, a, hi);
      };
      const wrapped = wrapToFit(t, nearby, measure);
      if (wrapped) return { layer: wrapped as L, hitMax: false };
    }
  }
  if (ok(next)) return { layer: next, hitMax: false };
  const hitMax = inRegion(next) && !inMax(next);

  if (prev && ok(prev)) {
    const moved = prev.cx !== next.cx || prev.cy !== next.cy;
    const sameShape = sizeOf(prev) === sizeOf(next) && prev.rotation === next.rotation &&
      (prev.kind !== "text" || next.kind !== "text" || (prev.text === next.text && prev.fontId === next.fontId && prev.bold === next.bold));
    if (moved && sameShape) {
      // slide along the edges: go as far as possible across, then down, a few times
      const advance = (from: L, to: L): L => {
        if (ok(to)) return to;
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (ok(lerpPos(from, to, mid))) lo = mid;
          else hi = mid;
        }
        return lerpPos(from, to, lo);
      };
      // as close to where the finger / mouse is as the rules allow
      let cur: L = advance(prev, next);
      const dist = (l: L) => Math.hypot(l.cx - next.cx, l.cy - next.cy);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]];
      for (const step of [4, 2, 1, 0.5, 0.25, 0.1]) {
        for (let guard = 0; guard < 40; guard++) {
          let best: L | null = null;
          for (const [dx, dy] of dirs) {
            const cand = { ...cur, cx: cur.cx + dx! * step, cy: cur.cy + dy! * step };
            if (dist(cand) < dist(best ?? cur) - 1e-6 && ok(cand)) best = cand;
          }
          if (!best) break;
          cur = best;
        }
      }
      return { layer: cur, hitMax };
    }
    if (!moved && sizeOf(prev) !== sizeOf(next) && prev.rotation === next.rotation && sizeOf(next) > sizeOf(prev)) {
      // A bigger size asked (typed or dragged): as big as the largest print allows, sliding inwards
      // when an edge is in the way (the size matters more than the exact place).
      let target = next;
      if (!inMax(next)) {
        let lo2 = sizeOf(prev);
        let hi2 = sizeOf(next);
        for (let i = 0; i < 16; i++) {
          const mid = (lo2 + hi2) / 2;
          if (inMax(withSize(next, mid))) lo2 = mid;
          else hi2 = mid;
        }
        target = withSize(next, Math.floor(lo2 * 10) / 10);
      }
      if (ok(target)) return { layer: target, hitMax: hitMax || target !== next };
      // the chest's middle, or a little lower for a tall design (its top must stay under the collar)
      let anchorAt = { ...target, cx: regionAnchor(side, region)[0], cy: regionAnchor(side, region)[1] };
      for (let dy = 0; dy <= 30 && !ok(anchorAt); dy += 0.5) anchorAt = { ...anchorAt, cy: regionAnchor(side, region)[1] + dy };
      if (ok(anchorAt)) {
        let lo3 = 0;
        let hi3 = 1;
        for (let i = 0; i < 14; i++) {
          const mid = (lo3 + hi3) / 2;
          if (ok(lerpPos(target, anchorAt, mid))) hi3 = mid;
          else lo3 = mid;
        }
        return { layer: lerpPos(target, anchorAt, hi3), hitMax: hitMax || target !== next };
      }
    }
    if (!moved && sizeOf(prev) !== sizeOf(next) && prev.rotation === next.rotation) {
      // grow only as far as it fits (a size that fits the largest print but not here: slides inwards, below)
      let lo = sizeOf(prev);
      let hi = sizeOf(next);
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (ok(withSize(next, mid))) lo = mid;
        else hi = mid;
      }
      return { layer: withSize(next, Math.floor(lo * 10) / 10), hitMax };
    }
  }

  // pull towards the chest…
  const anchor = { ...next, cx: regionAnchor(side, region)[0], cy: regionAnchor(side, region)[1] };
  if (ok(anchor)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (ok(lerpPos(next, anchor, mid))) hi = mid;
      else lo = mid;
    }
    return { layer: lerpPos(next, anchor, hi), hitMax };
  }
  // …and shrink there if it is still too big
  let lo = 0.1;
  let hi = sizeOf(next);
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (ok(withSize(anchor, mid))) lo = mid;
    else hi = mid;
  }
  return { layer: withSize(anchor, Math.max(0.5, Math.floor(lo * 10) / 10)), hitMax };
}

/**
 * The M design as printed on one ordered size: scaled by the size's ratio
 * (`layersForSize`); if that is bigger than the size's largest print, shrunk
 * to fit it, keeping its top and its middle where they were. `shrunk`: the
 * size prints smaller than the plain ratio.
 */
export function layersForOrderSize(
  layers: Layer[],
  side: TshirtSide,
  size: string,
  measure: Measure,
  sleeveCm: number = TSHIRT_SLEEVE_CM,
): { layers: Layer[]; shrunk: boolean } {
  const scaled = layersForSize(layers, side, size);
  const b = layersBounds(scaled, measure);
  const area = sizePrintArea(side, size, sleeveCm);
  if (!b || fitsFrames(area, ceilCm(b.w), ceilCm(b.h))) return { layers: scaled, shrunk: false };
  const frames = area.frames ?? [{ w: area.maxWidthCm, h: area.maxHeightCm }];
  let f = Math.max(...frames.map((fr) => Math.min(fr.w / b.w, fr.h / b.h)));
  const midX = b.x + b.w / 2;
  const top = b.y;
  const shrink = (k: number) =>
    scaleLayers(scaled, k).map((l) => ({ ...l, cx: l.cx + midX * (1 - k), cy: l.cy + top * (1 - k) }));
  let out = shrink(f);
  for (let i = 0; i < 40; i++) {
    const ob = layersBounds(out, measure)!;
    if (fitsFrames(area, ceilCm(ob.w), ceilCm(ob.h))) break;
    f *= 0.995;
    out = shrink(f);
  }
  return { layers: out, shrunk: true };
}
