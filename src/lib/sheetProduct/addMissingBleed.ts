/**
 * Generates the bleed for artwork made at the finished (trim) size — what the
 * operator used to do by hand: grow the canvas by `bleedCm` on every side and
 * fill the new band with a continuation of the picture. The outermost pixel
 * row and column are stretched outwards: a mirror would turn text near the
 * edge into reversed lettering, while a stretched edge reads as the same
 * background over a 2 mm band, so the cut can drift without a white edge.
 *
 * Artwork that already carries the bleed (its proportions match the footprint,
 * not the trim) is returned untouched. Square-ish sizes where trim and
 * footprint share proportions cannot be told apart and are left as-is too.
 */

import sharp from "sharp";
import { sheetFootprintFromTrim } from "./sheetProductConfig";

const SHARP_OPTS = { limitInputPixels: false, failOn: "none" } as const;

/** Proportion tolerance on a log scale (≈2 %), loose enough for pixel rounding. */
const ASPECT_LOG_TOLERANCE = 0.02;

export interface TrimSizeCm {
  widthCm: number;
  heightCm: number;
}

export interface MissingBleedResult {
  buffer: Buffer;
  /** True when the bleed band was generated. */
  generated: boolean;
}

function longOverShort(width: number, height: number): number {
  return Math.max(width, height) / Math.min(width, height);
}

function logDistance(a: number, b: number): number {
  return Math.abs(Math.log(a / b));
}

export async function addMissingBleed(
  buffer: Buffer,
  trim: TrimSizeCm,
  bleedCm: number,
): Promise<MissingBleedResult> {
  if (!(bleedCm > 0) || !(trim.widthCm > 0) || !(trim.heightCm > 0)) {
    return { buffer, generated: false };
  }

  // Bake EXIF orientation so the stretched band follows the visible edges.
  const normalized = await sharp(buffer, SHARP_OPTS).rotate().toBuffer();
  const meta = await sharp(normalized, SHARP_OPTS).metadata();
  const widthPx = meta.width ?? 0;
  const heightPx = meta.height ?? 0;
  if (widthPx <= 0 || heightPx <= 0) return { buffer, generated: false };

  const footprint = sheetFootprintFromTrim(trim.widthCm, trim.heightCm, bleedCm);
  const artworkRatio = longOverShort(widthPx, heightPx);
  const toTrim = logDistance(artworkRatio, longOverShort(trim.widthCm, trim.heightCm));
  const toFootprint = logDistance(
    artworkRatio,
    longOverShort(footprint.cardWidthCm, footprint.cardHeightCm),
  );
  if (toTrim > ASPECT_LOG_TOLERANCE || toTrim >= toFootprint) {
    return { buffer, generated: false };
  }

  // Match each pixel axis to the trim side it represents (orientation-free).
  const trimLongCm = Math.max(trim.widthCm, trim.heightCm);
  const trimShortCm = Math.min(trim.widthCm, trim.heightCm);
  const landscape = widthPx >= heightPx;
  const trimCmAcross = landscape ? trimLongCm : trimShortCm;
  const trimCmDown = landscape ? trimShortCm : trimLongCm;

  const leftRightPx = Math.max(1, Math.round((widthPx * bleedCm) / trimCmAcross));
  const topBottomPx = Math.max(1, Math.round((heightPx * bleedCm) / trimCmDown));

  const extended = await sharp(normalized, SHARP_OPTS)
    .extend({
      top: topBottomPx,
      bottom: topBottomPx,
      left: leftRightPx,
      right: leftRightPx,
      extendWith: "copy",
    })
    .png()
    .toBuffer();
  return { buffer: extended, generated: true };
}
