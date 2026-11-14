/**
 * Ready placements for the client (the DTF zones of the order form): pick
 * «Piept stânga» and the design becomes a 10 × 10 logo on the left chest,
 * «Față medie» an A4 in the middle of the chest, and so on. Each one is a box
 * in real cm on its side (x from the centre line, + = the wearer's left; y
 * from the HPS; a sleeve: its print square). Pure.
 */
import type { DtfPlacement } from "@/lib/dtf/dtfConstants";
import { layerBoxCm, scaleLayers, type Layer, type Measure } from "./tshirtLayers";
import { layersBounds } from "./tshirtRegion";
import { TSHIRT_PRINT_AREA, TSHIRT_REFERENCE_SIZE, anchorTopCm, neckDropCm, placementCm, type PrintArea, type TshirtSide } from "./tshirtRules";

export type TshirtPlacement = Exclude<DtfPlacement, "other">;

export interface PlacementBox {
  side: TshirtSide;
  /** Centre (cm) and size of the box the design is fitted into. */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/**
 * What the client picks from (per side, on that side's tab): the front print
 * in the middle, or a logo on the left / right chest; on the back the back
 * print or a small one under the collar. Sleeves have their own tabs.
 */
export const TSHIRT_FRONT_PLACEMENTS: readonly TshirtPlacement[] = ["front", "chest_right", "chest_left"];
export const TSHIRT_BACK_PLACEMENTS: readonly TshirtPlacement[] = ["back", "nape"];

/** A chest logo: up to 10 × 10 cm. */
const LOGO_CM = 10;

/**
 * The box of a placement on a size (cm under the HPS, x from the middle), at
 * that size's standard position (`TSHIRT_PLACEMENT_CM`): a front / back print
 * starts its distance under the collar seam, a chest logo sits its distance
 * down and off the middle, «under the collar» 2.5 cm under the back collar.
 * `area`: the largest print (the middle prints may fill it).
 */
export function placementBox(
  p: TshirtPlacement,
  sleeveCm: number,
  area: PrintArea = TSHIRT_PRINT_AREA.front,
  size: string = TSHIRT_REFERENCE_SIZE,
): PlacementBox {
  const box = (side: TshirtSide, cx: number, top: number, w: number, h: number): PlacementBox => ({ side, cx, cy: top + h / 2, w, h });
  const at = placementCm(size);
  switch (p) {
    case "front":
    case "front_mid":
    case "chest_center":
    case "chest_across":
      return box("front", 0, anchorTopCm("front", size), area.maxWidthCm, area.maxHeightCm);
    case "chest_left":
      // The wearer's left: the viewer's right on the front. Its top a little under the front collar seam.
      return box("front", at.logoX, neckDropCm("front", size) + at.logoDown, LOGO_CM, LOGO_CM);
    case "chest_right":
      return box("front", -at.logoX, neckDropCm("front", size) + at.logoDown, LOGO_CM, LOGO_CM);
    case "sleeve_left":
    case "sleeve_right":
      return box(p, 0, 0, sleeveCm, sleeveCm);
    case "back":
    case "back_mid":
      return box("back", 0, anchorTopCm("back", size), area.maxWidthCm, area.maxHeightCm);
    case "nape":
      return box("back", 0, neckDropCm("back", size) + at.nape, 9, 6);
  }
}

/** Size of a layer (image width or text letter height). */
function sizeOf(l: Layer): number {
  return l.kind === "image" ? l.widthCm : l.sizeCm;
}
function withSize<L extends Layer>(l: L, v: number): L {
  return (l.kind === "image" ? { ...l, widthCm: v } : { ...l, sizeCm: v }) as L;
}

/**
 * The side's design moved into the place as one group (texts and pictures keep
 * their places to each other): centred across, its top at the place's top.
 * A chest logo (≤ 10 × 10): a design bigger than
 * the square is shrunk to fit it (`shrunk`) — a logo stays a logo. The middle
 * prints keep the size. `tooBig`: still larger than the place.
 */
export function moveLayersToBox(
  layers: Layer[],
  box: PlacementBox,
  measure: Measure,
): { layers: Layer[]; tooBig: boolean; shrunk: boolean } {
  let b = layersBounds(layers, measure);
  if (!b || b.w <= 0 || b.h <= 0) return { layers, tooBig: false, shrunk: false };
  const logo = box.w <= LOGO_CM + 0.01 && box.h <= LOGO_CM + 0.01;
  let list = layers;
  let shrunk = false;
  if (logo && (b.w > box.w + 0.05 || b.h > box.h + 0.05)) {
    let k = Math.min(box.w / b.w, box.h / b.h) * 0.98;
    for (let i = 0; i < 20; i++) {
      list = scaleLayers(layers, k);
      b = layersBounds(list, measure)!;
      if (b.w <= box.w + 0.05 && b.h <= box.h + 0.05) break;
      k *= 0.97;
    }
    shrunk = true;
  }
  const gx = b.x + b.w / 2;
  const gy = b.y + b.h / 2;
  // its top at the place's top (a logo too: it starts where a chest logo starts)
  const cy = box.cy - box.h / 2 + b.h / 2;
  const moved = list.map((l) => ({ ...l, cx: l.cx + (box.cx - gx), cy: l.cy + (cy - gy) }));
  return { layers: moved, tooBig: b.w > box.w + 0.05 || b.h > box.h + 0.05, shrunk };
}

/** Kept for the old callers: moved, never resized. */
export function fitLayersToBox(layers: Layer[], box: PlacementBox, measure: Measure): Layer[] {
  return moveLayersToBox(layers, box, measure).layers;
}

/** A new layer's size in a box: image width / text letter height that fits it (on one line), at most `cap`. */
export function sizeForBox(layer: Layer, box: PlacementBox, measure: Measure): number {
  const one = layerBoxCm(withSize(layer, 1), measure);
  const k = Math.min(box.w / one.w, box.h / one.h) * 0.98;
  return Math.max(0.5, Math.round(k * 10) / 10);
}
