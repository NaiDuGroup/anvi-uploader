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
  return shape === "cap" ? [-14.5, -2, 29, 20.5] : [-44, -4, 88, 82];
}

/** Where a transfer sits on the garment (cm, top-left corner and size). */
export interface ApparelPrintBox {
  view: ApparelView;
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  if (shape === "cap") return { view: "front", x: -w / 2, y: APPAREL_REFERENCE.cap.lengthCm - 1.5 - h, w, h };
  const neck = NECK[shape];
  if (zone === "back") return { view: "back", x: -w / 2, y: neck.back + (shape === "polo" ? 6.5 : 7.5), w, h };
  if (placement === "chest_left") {
    // Centred 10 cm (polo 11) to the wearer's left, top 5 cm under the collar.
    const cx: number = shape === "polo" ? 11 : 10;
    return { view: "front", x: cx - w / 2, y: neck.front + 5, w, h };
  }
  return { view: "front", x: -w / 2, y: neck.front + (placement === "chest_center" ? 5 : 6.5), w, h };
}
