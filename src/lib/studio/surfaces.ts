import { MUG_DEFAULT_PRINT, NOTEBOOK_DEFAULT_PRINT, PEN_DEFAULT_PRINT, cmToPx, type PrintSizeCm } from "@/lib/printDimensions";
import { SHOP_BC_BLEED_MM, SHOP_BC_DPI, SHOP_BC_FILE_MM, SHOP_BC_SAFE_MM } from "@/lib/storefront/businessCards";
import { PS_BLEED_MM, PS_DPI, PS_SAFE_MM } from "@/lib/storefront/printShop/config";
import type { StudioDoc, StudioKind, StudioSurface } from "./document";

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
 *
 * Business cards (`card`): the canvas is the whole file the workshop imposes,
 * trim + bleed (94 × 54 mm at 300 dpi = 1110 × 638 px, the same file the
 * upload page asks for). `bleedMm` is the band outside the cut line (drawn
 * red), `safeMm` is measured from the file edge (bleed + 4 mm, drawn blue).
 * Two surfaces: «Față» always, «Verso» optional (`optional`: only in the
 * document once the customer adds it). A print area higher than wide gives
 * the vertical card (50 × 90) with the same rules.
 */

export const STUDIO_DEFAULT_PRINT: Record<StudioKind, PrintSizeCm> = {
  mug: MUG_DEFAULT_PRINT,
  notebook: NOTEBOOK_DEFAULT_PRINT,
  pen: PEN_DEFAULT_PRINT,
  card: { widthCm: SHOP_BC_FILE_MM.width / 10, heightCm: SHOP_BC_FILE_MM.height / 10, dpi: SHOP_BC_DPI },
  // Flyers: A5 by default (148 × 210 + 2 mm bleed); the format switch passes its own size (`flyerPrint`).
  flyer: { widthCm: (148 + 2 * PS_BLEED_MM) / 10, heightCm: (210 + 2 * PS_BLEED_MM) / 10, dpi: PS_DPI },
};

/** Business card: the vertical file (50 × 90 + bleed), for when the vertical layout is offered. */
export const CARD_PORTRAIT_PRINT: PrintSizeCm = { widthCm: SHOP_BC_FILE_MM.height / 10, heightCm: SHOP_BC_FILE_MM.width / 10, dpi: SHOP_BC_DPI };

/** Surface ids of a business card. */
export const CARD_FRONT_ID = "front";
export const CARD_BACK_ID = "back";

const SURFACE_ID: Record<StudioKind, string> = { mug: "wrap", notebook: "cover", pen: "barrel", card: CARD_FRONT_ID, flyer: CARD_FRONT_ID };
const BLEED_MM: Record<StudioKind, number> = { mug: 1, notebook: 2, pen: 0.3, card: SHOP_BC_BLEED_MM, flyer: PS_BLEED_MM };
const SAFE_MM: Record<StudioKind, number> = { mug: 4, notebook: 5, pen: 1, card: SHOP_BC_BLEED_MM + SHOP_BC_SAFE_MM, flyer: PS_BLEED_MM + PS_SAFE_MM };

/** Trimmed sheet products (front + optional back, printed edge to edge and cut): business cards and flyers. */
export const SHEET_STUDIO_KINDS = ["card", "flyer"] as const satisfies readonly StudioKind[];
export type SheetStudioKind = (typeof SHEET_STUDIO_KINDS)[number];
export function isSheetKind(kind: StudioKind | string | null | undefined): kind is SheetStudioKind {
  return kind === "card" || kind === "flyer";
}
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
  /** Not in a new document: added by the customer (business-card back). */
  optional?: boolean;
  /**
   * Printed edge to edge and trimmed (business cards): the band outside the
   * cut line is shaded in the editor, backgrounds must reach the file edge
   * and template sample texts are never printed.
   */
  trimmed?: boolean;
}

/** The surfaces of a product with this print area. */
export function studioSurfaces(kind: StudioKind, print: PrintSizeCm = STUDIO_DEFAULT_PRINT[kind]): StudioSurfaceSpec[] {
  const widthMm: number = Math.round(print.widthCm * 100) / 10;
  const heightMm: number = Math.round(print.heightCm * 100) / 10;
  const handle: number = Math.min(MUG_HANDLE_ZONE_MM, widthMm / 6);
  if (isSheetKind(kind)) {
    const side = (id: string, optional: boolean): StudioSurfaceSpec => ({
      id,
      widthMm,
      heightMm,
      bleedMm: BLEED_MM[kind],
      safeMm: SAFE_MM[kind],
      background: null,
      dpi: print.dpi,
      pxW: cmToPx(print.widthCm, print.dpi),
      pxH: cmToPx(print.heightCm, print.dpi),
      zones: [],
      seams: [],
      trimmed: true,
      ...(optional ? { optional: true } : {}),
    });
    return [side(CARD_FRONT_ID, false), side(CARD_BACK_ID, true)];
  }
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

/** Surfaces a new document starts with (the optional ones are added later). */
export function initialSurfaceBases(specs: readonly StudioSurfaceSpec[]): Omit<StudioSurface, "layers">[] {
  return specs.filter((s, i) => i === 0 || !s.optional).map(surfaceBase);
}

/**
 * Surfaces a document keeps when it is fitted to the product's print area:
 * every required one, and an optional one only when the document has it.
 */
export function docSurfaceBases(doc: Pick<StudioDoc, "surfaces">, specs: readonly StudioSurfaceSpec[]): Omit<StudioSurface, "layers">[] {
  return specs.filter((s, i) => i === 0 || !s.optional || doc.surfaces.some((d) => d.id === s.id)).map(surfaceBase);
}
