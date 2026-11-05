import type { StudioDoc, StudioImageLayer } from "./document";
import type { StudioSurfaceSpec } from "./surfaces";
import { isMagicMugText } from "./magicMug";

/**
 * Fixed views of the mug (Left / Front / Right) and where the 3D preview
 * opens. The wrap between the two handle strips is split into three equal
 * zones; the editor labels them «left / centre / right» under the flat strip
 * and the 3D view buttons turn the mug to the middle of each zone, so a
 * label in the editor and a button in the preview always mean the same part
 * of the print. Pure.
 */

export const MUG_VIEWS = ["left", "front", "right"] as const;
export type MugView = (typeof MUG_VIEWS)[number];

export interface MugViewZone {
  view: MugView;
  /** Left edge and width on the wrap (mm). */
  x: number;
  w: number;
}

/** The three zones of the wrap between the handle strips (mm). */
export function mugViewZones(spec: Pick<StudioSurfaceSpec, "widthMm" | "zones">): MugViewZone[] {
  const handles = spec.zones.filter((z) => z.kind === "handle");
  const W: number = spec.widthMm;
  // Strips at both ends: the printable middle runs from the end of the left one to the start of the right one.
  const start: number = handles.filter((z) => z.x <= W / 2).reduce((m, z) => Math.max(m, z.x + z.w), 0);
  const end: number = handles.filter((z) => z.x > W / 2).reduce((m, z) => Math.min(m, z.x), W);
  const w: number = Math.max(0, end - start) / 3;
  return MUG_VIEWS.map((view, i) => ({ view, x: start + w * i, w }));
}

/** Position on the wrap (0 = left edge … 1 = right edge) a view button turns to. */
export function mugViewU(spec: Pick<StudioSurfaceSpec, "widthMm" | "zones">, view: MugView): number {
  if (spec.widthMm <= 0) return 0.5;
  const z: MugViewZone = mugViewZones(spec).find((v) => v.view === view)!;
  return (z.x + z.w / 2) / spec.widthMm;
}

/** The view whose zone holds position `u` (the handle strips count to the nearest side). */
export function mugViewOfU(spec: Pick<StudioSurfaceSpec, "widthMm" | "zones">, u: number): MugView {
  const x: number = u * spec.widthMm;
  const zones: MugViewZone[] = mugViewZones(spec);
  if (x < zones[1]!.x) return "left";
  if (x >= zones[2]!.x) return "right";
  return "front";
}

/**
 * The main photo of the design: the visible photo with the largest area on
 * the print (empty photo spots do not count). Null without photos.
 */
export function mugMainPhoto(doc: StudioDoc, surfaceId?: string): StudioImageLayer | null {
  const surface = (surfaceId ? doc.surfaces.find((s) => s.id === surfaceId) : null) ?? doc.surfaces[0];
  if (!surface) return null;
  let best: StudioImageLayer | null = null;
  let bestArea = 0;
  for (const l of surface.layers) {
    if (l.kind !== "image" || l.hidden || !l.src || (l.opacity ?? 1) < 0.3) continue;
    // Only the part on the print counts (a photo pushed half off the strip shows less).
    const w: number = Math.max(0, Math.min(l.x + l.w, surface.widthMm) - Math.max(l.x, 0));
    const h: number = Math.max(0, Math.min(l.y + l.h, surface.heightMm) - Math.max(l.y, 0));
    const area: number = w * h;
    if (area > bestArea) {
      best = l;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Where the 3D mug opens: the centre of the main photo on the wrap, else
 * the front (the middle zone). 0 = left edge … 1 = right edge.
 */
export function mugOpeningU(doc: StudioDoc, spec: Pick<StudioSurfaceSpec, "widthMm" | "zones">): number {
  const photo: StudioImageLayer | null = mugMainPhoto(doc);
  if (!photo || spec.widthMm <= 0) return mugViewU(spec, "front");
  const W: number = spec.widthMm;
  // Centre of the visible part of the photo.
  const a: number = Math.max(photo.x, 0);
  const b: number = Math.min(photo.x + photo.w, W);
  return Math.max(0, Math.min(1, (a + b) / 2 / W));
}

/** Angle (rad) of wrap position `u` on the 3D label cylinder. */
export function mugThetaOfU(u: number, thetaStart: number, thetaLength: number): number {
  return thetaStart + Math.max(0, Math.min(1, u)) * thetaLength;
}

/**
 * A thermo-magic («chameleon») mug: black when cold, the print shows with a
 * hot drink. Told by the product / catalog item names and SKU (the 3D finish
 * of such a mug is plain «matte», so the name is what marks it).
 */
export function isMagicMug(...texts: readonly (string | null | undefined)[]): boolean {
  return isMagicMugText(...texts);
}

/** Colour of a cold magic mug (the coating; same black as the catalog's «Neagră mată»). */
export const MAGIC_COLD_HEX = "#1c1c1c";
