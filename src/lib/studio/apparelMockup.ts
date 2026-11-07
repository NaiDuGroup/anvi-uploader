import type { ShopDtfPlacement } from "@/lib/storefront/types";
import type { ApparelShape, ApparelZoneId } from "./apparel";

/**
 * Geometry of the apparel mockups (ApparelMockup.tsx), in centimetres of the
 * real garment, so a transfer drawn at its format size is to scale: an A3
 * (30 cm wide) covers 30 of the 54 cm across a size L T-shirt's chest.
 *
 * Garment coordinates: x = 0 on the centre line (the viewer's right is the
 * wearer's left), y = 0 at the shoulder seam's high point by the collar (HPS)
 * for tops, at the top of the crown for the cap. Pure.
 */

export type ApparelView = "front" | "back";

/** The size the mockup is drawn at (flat garment measurements, cm). */
export interface ApparelReference {
  size: string;
  /** Flat chest width (armpit to armpit). */
  chestCm: number;
  /** HPS to hem. */
  lengthCm: number;
}

export const APPAREL_REFERENCE: Record<ApparelShape, ApparelReference> = {
  // ROLY DOGO L: 54 × 74; AUSTRAL polo L: 55 × 74 (supplier size charts, rounded).
  tshirt: { size: "L", chestCm: 54, lengthCm: 74 },
  polo: { size: "L", chestCm: 55, lengthCm: 74 },
  // Adult cap: the crown front is ~20 cm across, ~11 cm high to the visor seam.
  cap: { size: "", chestCm: 20, lengthCm: 11 },
};

/** Views a garment shows (the cap is printed on its front only). */
export function apparelViews(shape: ApparelShape): ApparelView[] {
  return shape === "cap" ? ["front"] : ["front", "back"];
}

/** viewBox of a view (cm): x, y, width, height. */
export function apparelViewBox(shape: ApparelShape): [number, number, number, number] {
  return shape === "cap" ? [-14.5, -2, 29, 22.5] : [-44, -4, 88, 82];
}

/** Where a transfer sits on the garment (cm, top-left corner and size). */
export interface ApparelPrintBox {
  view: ApparelView;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cap: bottom of the logo below the top of the crown (cm); the peak seam is at ~12 cm in the middle. */
export const CAP_LOGO_BOTTOM_CM = 10.4;

/** Collar depths below the HPS (cm): front neck drop, back neck drop. */
export const NECK = { tshirt: { front: 9, back: 2.5 }, polo: { front: 7, back: 3.2 } } as const;

/**
 * The transfer's box on the garment: the usual press positions of the
 * workshop — full front / chest prints ~7 cm under the collar, the left
 * chest logo centred 10 cm off the centre line, the back ~8 cm under the
 * collar, the cap logo centred 1.5 cm above the visor seam.
 */
export function apparelPrintBox(shape: ApparelShape, zone: ApparelZoneId, placement: ShopDtfPlacement, widthCm: number, heightCm: number): ApparelPrintBox {
  const w: number = widthCm;
  const h: number = heightCm;
  // Cap: on the front panel, its bottom ~1.5 cm above the peak seam (the seam is at ~12 cm).
  if (shape === "cap") return { view: "front", x: -w / 2, y: CAP_LOGO_BOTTOM_CM - h, w, h };
  const neck = NECK[shape];
  if (zone === "back") return { view: "back", x: -w / 2, y: neck.back + (shape === "polo" ? 6.5 : 7.5), w, h };
  if (placement === "chest_left") {
    // Centred 10 cm (polo 11) to the wearer's left, top 5 cm under the collar.
    const cx: number = shape === "polo" ? 11 : 10;
    return { view: "front", x: cx - w / 2, y: neck.front + 5, w, h };
  }
  return { view: "front", x: -w / 2, y: neck.front + (placement === "chest_center" ? 5 : 6.5), w, h };
}

/**
 * The garment around a zone on the editor canvas, in mm of the zone (its
 * top-left = 0, 0): where the view's drawing lies, and what the view fits at
 * 100 %. A big print (A4, A3, the cap logo) fits the whole garment; a small
 * one (a chest logo) fits a part of it around the zone, so the handles stay
 * usable on a phone (the rest of the garment is still drawn, zoom out shows it).
 */
export function apparelCanvasBackdrop(
  shape: ApparelShape,
  box: ApparelPrintBox,
  /** Phones: a closer fit (the torso around the zone fills the width; zoom out shows the sleeves). */
  opts: { tight?: boolean } = {},
): { x: number; y: number; w: number; h: number; fit: { x: number; y: number; w: number; h: number } } {
  const [vx, vy, vw, vh] = apparelViewBox(shape);
  const x: number = (vx - box.x) * 10;
  const y: number = (vy - box.y) * 10;
  const w: number = vw * 10;
  const h: number = vh * 10;
  const wide: number = Math.max(0.6, Math.min(1, (Math.max(box.w, box.h) * 3.2) / Math.max(vw, vh)));
  const k: number = opts.tight ? Math.max(0.52, wide * 0.7) : wide;
  const fw: number = w * k;
  const fh: number = h * k;
  // Centred on the zone, kept inside the drawing.
  const cx: number = box.w * 5;
  // A little above the zone: the collar / neck stays in view.
  const cy: number = box.h * 5 - h * k * 0.08;
  const fx: number = Math.min(Math.max(cx - fw / 2, x), x + w - fw);
  const fy: number = Math.min(Math.max(cy - fh / 2, y), y + h - fh);
  return { x, y, w, h, fit: { x: fx, y: fy, w: fw, h: fh } };
}
