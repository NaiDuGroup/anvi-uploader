/**
 * Real-photo look of the t-shirt designer: Roly's DOGO photos (ghost
 * mannequin, size L; the same files and calibration as the ANVI Studio), shown
 * as Roly made them. A print is drawn at its real size in cm (the Studio's
 * scale: the chest measures 54 cm on L); another size is the photo scaled by
 * its chest, so the same print looks bigger on XS than on XXXL.
 *
 * Garment cm as everywhere in the designer: x = 0 on the centre line (the
 * viewer's right on the front is the wearer's left), y = 0 at the shoulder's
 * high point (HPS).
 *
 * Sleeves are seen from their side (the left side photo, the right one
 * mirrored), the print square centred on the sleeve. A sleeve design is in
 * sleeve cm: u across the square (centred), v down from its top edge. Pure.
 */
import { APPAREL_ASSET_PX, PHOTO_VIEWS, type PhotoView, type PhotoViewCalibration, type Rect } from "@/lib/studio/photoMockup";
import { TSHIRT_GARMENT_CM, TSHIRT_SIZES, garmentCm, isSleeve, type TshirtSide } from "./tshirtRules";

/** The photos show size L. */
export const PHOTO_REFERENCE = TSHIRT_GARMENT_CM.L!;

/** Hem of the garment on the photo (px of the 2000 px photo), measured on the black photos. */
const HEM_PX: Record<PhotoView, number> = { front: 2000, back: 1998, left: 1999, right: 1999 };

export function photoViewOf(side: TshirtSide): PhotoView {
  return side === "sleeve_left" ? "left" : side === "sleeve_right" ? "right" : side;
}

export function photoCalibration(view: PhotoView): PhotoViewCalibration {
  return PHOTO_VIEWS[`tshirt-${view}`]!;
}

/**
 * The shirt's real centre line on the photo (px of the 2000 px photo), measured
 * on the body's edges: the front photo's is 7 px right of the Studio's 992 —
 * without this a left and a right chest logo aren't mirror images.
 */
const TRUE_CENTRE_PX: Partial<Record<PhotoView, number>> = { front: 999 };
export function photoCentrePx(view: PhotoView): number {
  return TRUE_CENTRE_PX[view] ?? photoCalibration(view).centreXPx;
}

/**
 * Photo px (2000 px photo) per cm, across and lengthwise: the photo is shown
 * as Roly made it (one scale, the Studio's calibration — it looks right), so
 * the same both ways. A print keeps its real size in cm on it.
 */
export function photoPxPerCm(view: PhotoView): { x: number; y: number } {
  const cal = photoCalibration(view);
  return { x: cal.pxPerCm, y: cal.pxPerCm };
}

/** HPS → hem on the photo of size L, in the photo's cm. */
export function photoHemCm(view: PhotoView): number {
  const cal = photoCalibration(view);
  return (HEM_PX[view] - cal.originYPx) / photoPxPerCm(view).y;
}

/** Where the whole photo lies, in real garment cm at size L. */
export function photoImageCm(view: PhotoView): Rect {
  const cal = photoCalibration(view);
  const k = photoPxPerCm(view);
  return { x: -photoCentrePx(view) / k.x, y: -cal.originYPx / k.y, w: cal.sizePx / k.x, h: cal.sizePx / k.y };
}

/** How much bigger than the L photo a size is drawn: across (chest) and lengthwise (length). */
export function photoSizeFactor(size: string | null | undefined): { x: number; y: number } {
  const g = garmentCm(size);
  // One factor (the chest): the photo keeps its proportions.
  const k = g.chest / PHOTO_REFERENCE.chest;
  return { x: k, y: k };
}

/**
 * A box in real cm on the L photo → the Studio's photo cm (`printBoxToPhotoPx`
 * of `composeApparelPhoto`): the same across, stretched lengthwise as the photo.
 */
export function toStudioBox(view: PhotoView, box: Rect): Rect {
  const k = photoPxPerCm(view);
  const r = k.y / k.x;
  // the Studio measures across from its own centre: shift to the shirt's real one
  const dx = (photoCentrePx(view) - photoCalibration(view).centreXPx) / k.x;
  return { x: box.x + dx, y: box.y * r, w: box.w, h: box.h * r };
}

/** Middle of the sleeve print square on the side photo (photo cm at size L): centred on the sleeve, low on it (as the ANVI Studio). */
export const SLEEVE_PRINT_MIDDLE: { cx: number; cy: number } = { cx: 0, cy: 22 };

/** Sleeve cm (u across, v from the square's top) → side-photo real cm at size L, for a shirt `f` times the L. */
export function sleeveToPhotoCm(u: number, v: number, squareCm: number, f: { x: number; y: number } = { x: 1, y: 1 }): [number, number] {
  return [SLEEVE_PRINT_MIDDLE.cx + u / f.x, SLEEVE_PRINT_MIDDLE.cy + (v - squareCm / 2) / f.y];
}

/**
 * How a side is shown on the editor stage (px): where design cm (0, 0) sits,
 * px per cm, and where the photo is drawn behind it. Front / back: one scale
 * for every size of the order (the biggest ordered fits), so a bigger shirt is
 * drawn bigger and the same print smaller on it. A sleeve: a close-up of the
 * side photo around its print square.
 */
export interface StageGeometry {
  pxPerCm: number;
  /** Stage px of the design's (0, 0): the HPS on front / back, the square's top centre on a sleeve. */
  originX: number;
  originY: number;
  photo: { view: PhotoView; left: number; top: number; width: number; height: number };
  height: number;
}

/** The biggest of these sizes (the stage scale); none: the shown one. */
export function biggestSize(sizes: readonly string[], fallback: string | null): string | null {
  let best: string | null = null;
  let rank = -1;
  for (const s of sizes) {
    const i = (TSHIRT_SIZES as readonly string[]).indexOf(s.toUpperCase().replace(/^3XL$/, "XXXL").replace(/^2XL$/, "XXL"));
    if (i > rank) {
      rank = i;
      best = s;
    }
  }
  return best ?? fallback;
}

export function stageGeometry(side: TshirtSide, size: string | null, stageW: number, squareCm: number, scaleSize: string | null = size): StageGeometry {
  const view = photoViewOf(side);
  const img = photoImageCm(view);
  const f = photoSizeFactor(size);
  const photoAt = (pxPerCm: number, originX: number, originY: number) => ({
    view,
    left: originX + img.x * f.x * pxPerCm,
    top: originY + img.y * f.y * pxPerCm,
    width: img.w * f.x * pxPerCm,
    height: img.h * f.y * pxPerCm,
  });
  if (!isSleeve(side)) {
    // The biggest ordered shirt with its sleeves fits ~98 cm across; the length + a little air below.
    const big = photoSizeFactor(scaleSize);
    const pxPerCm = stageW / (98 * big.x);
    const originX = stageW / 2;
    const originY = 3 * pxPerCm;
    const height = (photoHemCm(view) * big.y + 6) * pxPerCm;
    return { pxPerCm, originX, originY, photo: photoAt(pxPerCm, originX, originY), height };
  }
  // Sleeve close-up: ~34 cm across, the print square a little above the middle of the stage.
  const height = stageW;
  const pxPerCm = stageW / 34;
  const midX = stageW / 2;
  const midY = height * 0.45;
  // The square's middle on the photo of this size.
  const originX = midX - SLEEVE_PRINT_MIDDLE.cx * f.x * pxPerCm;
  const originYPhoto = midY - SLEEVE_PRINT_MIDDLE.cy * f.y * pxPerCm;
  return {
    pxPerCm,
    originX: midX,
    originY: midY - (squareCm / 2) * pxPerCm,
    photo: photoAt(pxPerCm, originX, originYPhoto),
    height,
  };
}

/** Asset px (the 1200 px files) of a real-cm point on the L photo. */
export function photoAssetPx(view: PhotoView, x: number, y: number): [number, number] {
  const cal = photoCalibration(view);
  const k = photoPxPerCm(view);
  const s = APPAREL_ASSET_PX / cal.sizePx;
  return [(photoCentrePx(view) + x * k.x) * s, (cal.originYPx + y * k.y) * s];
}
