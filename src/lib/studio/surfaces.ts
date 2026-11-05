import { MUG_DEFAULT_PRINT, NOTEBOOK_DEFAULT_PRINT, PEN_DEFAULT_PRINT, cmToPx, type PrintSizeCm } from "@/lib/printDimensions";
import type { StudioKind, StudioSurface } from "./document";

/**
 * Printable surfaces of the Studio products, from the catalog print area
 * (`printWidthCm` × `printHeightCm` @ `printDpi`, the same numbers the old
 * editors use). The export covers exactly that area at that dpi, so the print
 * PNG has the same pixel size as the old editor's.
 *
 * Bleed is the outer band of the print area that may be lost on the product
 * (sublimation wrap edges, cover fold); the safe zone keeps text and faces
 * away from it. On the mug both ends of the wrap meet behind the handle: the
 * seam is there and the strips next to it sit beside the handle.
 */

export const STUDIO_DEFAULT_PRINT: Record<StudioKind, PrintSizeCm> = {
  mug: MUG_DEFAULT_PRINT,
  notebook: NOTEBOOK_DEFAULT_PRINT,
  pen: PEN_DEFAULT_PRINT,
};

const SURFACE_ID: Record<StudioKind, string> = { mug: "wrap", notebook: "cover", pen: "barrel" };
const BLEED_MM: Record<StudioKind, number> = { mug: 1, notebook: 2, pen: 0.3 };
const SAFE_MM: Record<StudioKind, number> = { mug: 4, notebook: 5, pen: 1 };
/** Width of the strip at each end of the mug wrap that sits beside the handle. */
export const MUG_HANDLE_ZONE_MM = 15;

export interface StudioZone {
  kind: "handle";
  x: number;
  w: number;
}

export interface StudioSurfaceSpec extends Omit<StudioSurface, "layers"> {
  /** Print resolution of the export (dpi), from the catalog. */
  dpi: number;
  /** Export size in pixels (same rounding as the old editors: `cmToPx`). */
  pxW: number;
  pxH: number;
  /** Mug: strips beside the handle. */
  zones: StudioZone[];
  /** Mug: x of the wrap seam(s), mm. */
  seams: number[];
}

/** The surfaces of a product with this print area. */
export function studioSurfaces(kind: StudioKind, print: PrintSizeCm = STUDIO_DEFAULT_PRINT[kind]): StudioSurfaceSpec[] {
  const widthMm: number = Math.round(print.widthCm * 100) / 10;
  const heightMm: number = Math.round(print.heightCm * 100) / 10;
  const handle: number = Math.min(MUG_HANDLE_ZONE_MM, widthMm / 6);
  return [
    {
      id: SURFACE_ID[kind],
      widthMm,
      heightMm,
      bleedMm: BLEED_MM[kind],
      safeMm: SAFE_MM[kind],
      background: null,
      dpi: print.dpi,
      pxW: cmToPx(print.widthCm, print.dpi),
      pxH: cmToPx(print.heightCm, print.dpi),
      zones:
        kind === "mug"
          ? [
              { kind: "handle", x: 0, w: handle },
              { kind: "handle", x: widthMm - handle, w: handle },
            ]
          : [],
      seams: kind === "mug" ? [0, widthMm] : [],
    },
  ];
}

/** Document part of a surface spec (what `emptyStudioDoc` / `fitDocToSurfaces` take). */
export function surfaceBase(spec: StudioSurfaceSpec): Omit<StudioSurface, "layers"> {
  return {
    id: spec.id,
    widthMm: spec.widthMm,
    heightMm: spec.heightMm,
    bleedMm: spec.bleedMm,
    safeMm: spec.safeMm,
    background: spec.background,
  };
}

/** Print area of a catalog item (`/api/<kind>-products`), else the product default. */
export function printOfItem(
  kind: StudioKind,
  item: { printWidthCm: number; printHeightCm: number; printDpi: number } | null | undefined,
): PrintSizeCm {
  return item ? { widthCm: item.printWidthCm, heightCm: item.printHeightCm, dpi: item.printDpi } : STUDIO_DEFAULT_PRINT[kind];
}
