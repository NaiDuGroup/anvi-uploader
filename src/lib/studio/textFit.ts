import type { StudioDoc, StudioSurface, StudioTextLayer } from "./document";
import { MUG_HANDLE_ZONE_MM } from "./surfaces";

/**
 * Text boxes after a re-measure (fonts loaded, «Datele mele» filled, template
 * switched). A template or «Datele mele» text that comes out wider than the
 * room it has (Russian, a long company name) must not spill into the handle
 * strips or past the safe zone, so it shrinks to fit instead. Pure.
 */

export type TextBandMode = "none" | "bound" | "all";

/** Smallest size a band fit goes down to (the quality check wants ≥ 7 pt). */
export const TEXT_FIT_MIN_PT = 7;

export type MeasureText = (layer: StudioTextLayer) => { w: number; h: number };

/**
 * The layer with its measured box, centred where it was; with `band`, a box
 * wider than the band shrinks the text (sizePt) so it fits the band width.
 */
export function fitTextLayer(layer: StudioTextLayer, measure: MeasureText, band: number | null): StudioTextLayer {
  let l: StudioTextLayer = layer;
  let m = measure(l);
  if (band != null && m.w > band + 0.01) {
    for (let i = 0; i < 4 && m.w > band + 0.01 && l.sizePt > TEXT_FIT_MIN_PT; i++) {
      const sizePt: number = Math.max(TEXT_FIT_MIN_PT, Math.floor(l.sizePt * (band / m.w) * 10) / 10);
      const strokeK: number = sizePt / l.sizePt;
      l = { ...l, sizePt, ...(l.stroke ? { stroke: { ...l.stroke, widthMm: Math.max(0.05, l.stroke.widthMm * strokeK) } } : {}) };
      m = measure(l);
    }
  }
  if (l === layer && Math.abs(m.w - layer.w) < 0.01 && Math.abs(m.h - layer.h) < 0.01) return layer;
  const cx: number = layer.x + layer.w / 2;
  const cy: number = layer.y + layer.h / 2;
  const w: number = Math.max(0.5, m.w);
  const h: number = Math.max(0.5, m.h);
  return { ...l, x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Widest box this text may have where it stands: centred on its box, inside the
 * safe zone and clear of the mug handle strips (what the quality check wants).
 */
export function textBandWidth(l: StudioTextLayer, surface: Pick<StudioSurface, "widthMm" | "safeMm">, kind: StudioDoc["kind"]): number | null {
  if (Math.abs(Math.sin(((l.rotation ?? 0) * Math.PI) / 180)) > 1e-6) return null;
  const handle: number = kind === "mug" ? Math.min(MUG_HANDLE_ZONE_MM, surface.widthMm / 6) : 0;
  const margin: number = Math.max(surface.safeMm, handle) + 0.5;
  const cx: number = l.x + l.w / 2;
  const half: number = Math.min(cx - margin, surface.widthMm - margin - cx);
  return half > 1 ? half * 2 : null;
}

function bandFor(l: StudioTextLayer, mode: TextBandMode, surface: StudioSurface, kind: StudioDoc["kind"]): number | null {
  if (mode === "none" || (mode === "bound" && l.bind == null && l.placeholder !== true)) return null;
  return textBandWidth(l, surface, kind);
}

/** Every text box of the document re-measured; same object when nothing changed. */
export function fitDocTexts(doc: StudioDoc, measure: MeasureText, mode: TextBandMode = "none"): StudioDoc {
  let changed = false;
  const surfaces = doc.surfaces.map((s) => {
    let sChanged = false;
    const layers = s.layers.map((l) => {
      if (l.kind !== "text") return l;
      const f = fitTextLayer(l, measure, bandFor(l, mode, s, doc.kind));
      if (f !== l) sChanged = true;
      return f;
    });
    if (!sChanged) return s;
    changed = true;
    return { ...s, layers };
  });
  return changed ? { ...doc, surfaces } : doc;
}
