/**
 * Generates the bleed for artwork made at the finished (trim) size — what the
 * operator used to do by hand in Photoshop: grow the canvas by `bleedCm` on
 * every side and "Fill → Content-Aware" the new band, so the picture carries
 * on past the cut (see `contentAwareFill`). A mirror would reverse text near
 * the edge and a stretched edge leaves streaks; the stretch is kept only as a
 * fallback when the fill gives up.
 *
 * Artwork that already carries the bleed (its proportions match the footprint,
 * not the trim) is returned untouched. Square-ish sizes where trim and
 * footprint share proportions cannot be told apart and are left as-is too.
 */

import sharp from "sharp";
import { contentAwareFill, type RgbImage } from "./contentAwareFill";
import { sheetFootprintFromTrim } from "./sheetProductConfig";

const SHARP_OPTS = { limitInputPixels: false, failOn: "none" } as const;
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 } as const;
/** Band width the content-aware fill works at, before scaling back up. */
const WORK_BAND_PX = 12;
/**
 * Outermost artwork pixels (at work scale) refilled along with the band.
 * Exported files often end in a one-pixel light or dark seam; sampled as-is,
 * it would be copied into the band as streaks.
 */
const EDGE_RING_WORK_PX = 1;
const PATCH_RADIUS = 4;
/** How deep into the artwork (at work scale) the fill may borrow patches from. */
const SOURCE_DEPTH_WORK_PX = PATCH_RADIUS + 4;

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

  // Bake EXIF orientation so the generated band follows the visible edges.
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

  const extended =
    (await contentAwareExtend(normalized, widthPx, heightPx, leftRightPx, topBottomPx)) ??
    (await sharp(normalized, SHARP_OPTS)
      .extend({
        top: topBottomPx,
        bottom: topBottomPx,
        left: leftRightPx,
        right: leftRightPx,
        extendWith: "copy",
      })
      .png()
      .toBuffer());
  return { buffer: extended, generated: true };
}

/**
 * Grows the artwork by the bleed band filled content-aware. The fill runs on
 * a copy scaled so the band is about {@link WORK_BAND_PX} wide (fast, and
 * the softness of the upscaled band disappears under the knife); the trim
 * area is then laid back from the original, pixel for pixel, except the
 * outermost seam (see {@link EDGE_RING_WORK_PX}). Null when the artwork is too
 * small to sample or the fill gave up, so the caller can fall back.
 */
async function contentAwareExtend(
  normalized: Buffer,
  widthPx: number,
  heightPx: number,
  bandXPx: number,
  bandYPx: number,
): Promise<Buffer | null> {
  const scale = Math.min(1, WORK_BAND_PX / Math.min(bandXPx, bandYPx));
  if (widthPx * scale < 8 * WORK_BAND_PX || heightPx * scale < 8 * WORK_BAND_PX) {
    return null;
  }
  const workW = Math.max(1, Math.round(widthPx * scale));
  const workH = Math.max(1, Math.round(heightPx * scale));
  const workBandX = Math.max(1, Math.round(bandXPx * scale));
  const workBandY = Math.max(1, Math.round(bandYPx * scale));

  const small = await sharp(normalized, SHARP_OPTS)
    .flatten({ background: WHITE })
    .removeAlpha()
    .resize(workW, workH, { fit: "fill" })
    .raw()
    .toBuffer();

  const canvasW = workW + 2 * workBandX;
  const canvasH = workH + 2 * workBandY;
  const image: RgbImage = {
    width: canvasW,
    height: canvasH,
    data: new Uint8Array(canvasW * canvasH * 3),
  };
  const known = new Uint8Array(canvasW * canvasH);
  const ring = EDGE_RING_WORK_PX;
  for (let y = 0; y < workH; y++) {
    const srcRow = y * workW * 3;
    const dstRow = ((y + workBandY) * canvasW + workBandX) * 3;
    image.data.set(small.subarray(srcRow, srcRow + workW * 3), dstRow);
    if (y >= ring && y < workH - ring) {
      const rowStart = (y + workBandY) * canvasW + workBandX;
      known.fill(1, rowStart + ring, rowStart + workW - ring);
    }
  }

  if (!contentAwareFill(image, known, { patchRadius: PATCH_RADIUS, sourceDepth: SOURCE_DEPTH_WORK_PX })) {
    return null;
  }

  const outW = widthPx + 2 * bandXPx;
  const outH = heightPx + 2 * bandYPx;
  const band = await sharp(Buffer.from(image.data.buffer), {
    raw: { width: canvasW, height: canvasH, channels: 3 },
  })
    .resize(outW, outH, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
  // The refilled seam is a pixel or two of the original: keep the rest exact.
  const ringPx = Math.ceil(ring / scale);
  const trimArea = await sharp(normalized, SHARP_OPTS)
    .flatten({ background: WHITE })
    .extract({
      left: ringPx,
      top: ringPx,
      width: widthPx - 2 * ringPx,
      height: heightPx - 2 * ringPx,
    })
    .png()
    .toBuffer();
  return sharp(band)
    .composite([{ input: trimArea, left: bandXPx + ringPx, top: bandYPx + ringPx }])
    .png()
    .toBuffer();
}
