/**
 * Generates the bleed for artwork made at the finished (trim) size — what the
 * operator used to do by hand in Photoshop: grow the canvas by `bleedCm` on
 * every side and "Fill → Content-Aware" the new band, so the picture carries
 * on past the cut (see `contentAwareFill`). A mirror would reverse text near
 * the edge and a stretched edge leaves streaks; a softened stretch is used
 * only where the edge is a flat colour, and as a fallback when the fill gives up.
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
/**
 * Widest band the content-aware fill works at (2 mm at 300 DPI). Larger
 * bands are filled on a scaled-down copy; anything softer than the artwork
 * shows as a line along the cut, so print-resolution files are filled 1:1.
 */
const WORK_BAND_PX = 24;
/**
 * Outermost artwork pixels (at work scale) refilled along with the band.
 * Exported files often end in a pixel or two of light or dark seam; sampled as-is,
 * it would be copied into the band as streaks.
 */
const EDGE_RING_WORK_PX = 2;
const PATCH_RADIUS = 3;
/**
 * Edge texture (mean luma step, see `edgeActivity`) below which the band is a
 * plain stretch, and above which it is fully content-aware; blended between.
 */
const FLAT_EDGE_ACTIVITY = 0.5;
const TEXTURED_EDGE_ACTIVITY = 1.5;
const EDGE_STRIP_ALONG_PX = 4;
/** Tone matching window: along the edge either way, and depth on each side. */
const TONE_ALONG_PX = 12;
const TONE_DEPTH_PX = 3;
/** Half-width of the along-edge averaging per pixel of distance from the cut. */
const SMEAR_PER_PX = 0.5;
const EDGE_STRIP_DEPTH_PX = 2;
/** How deep into the artwork (at work scale) the fill may borrow patches from. */
const SOURCE_DEPTH_WORK_PX = 20;
/** About 5 s for a 15 × 7 cm side at 300 DPI; larger sheets scale with the perimeter. */
const FILL_TIME_BUDGET_MS = 60_000;

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
 * a copy scaled so the band is at most {@link WORK_BAND_PX} wide; the trim
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

  const weights = fillWeights(image.data, canvasW, canvasH, {
    left: workBandX + ring,
    top: workBandY + ring,
    right: workBandX + workW - ring,
    bottom: workBandY + workH - ring,
  });
  // All-flat edges (plain backgrounds) need no fill: the stretch is the answer.
  if (weights.some((w) => w > 0)) {
    const fillOptions = {
      patchRadius: PATCH_RADIUS,
      sourceDepth: SOURCE_DEPTH_WORK_PX,
      timeBudgetMs: FILL_TIME_BUDGET_MS,
    };
    if (!contentAwareFill(image, known, fillOptions)) return null;
    matchEdgeTone(image, {
      left: workBandX + ring,
      top: workBandY + ring,
      right: workBandX + workW - ring,
      bottom: workBandY + workH - ring,
    });
  }

  const outW = widthPx + 2 * bandXPx;
  const outH = heightPx + 2 * bandYPx;
  // The refilled seam is a pixel or two of the original: keep the rest exact.
  const ringPx = Math.ceil(ring / scale);
  const trimArea = sharp(normalized, SHARP_OPTS)
    .flatten({ background: WHITE })
    .removeAlpha()
    .extract({
      left: ringPx,
      top: ringPx,
      width: widthPx - 2 * ringPx,
      height: heightPx - 2 * ringPx,
    });
  const [filled, weightMap, inner, trimPng] = await Promise.all([
    sharp(Buffer.from(image.data.buffer), { raw: { width: canvasW, height: canvasH, channels: 3 } })
      .resize(outW, outH, { fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer(),
    sharp(Buffer.from(weights.buffer), { raw: { width: canvasW, height: canvasH, channels: 1 } })
      .resize(outW, outH, { fit: "fill", kernel: "linear" })
      .extractChannel(0)
      .raw()
      .toBuffer(),
    trimArea.clone().raw().toBuffer(),
    trimArea.clone().png().toBuffer(),
  ]);
  const blended = smearedStretch(
    inner,
    widthPx - 2 * ringPx,
    heightPx - 2 * ringPx,
    bandXPx + ringPx,
    bandYPx + ringPx,
  );

  // Start from the smeared stretch and mix the fill in where textured.
  for (let i = 0; i < weightMap.length; i++) {
    const w = weightMap[i]!;
    if (w === 0) continue;
    for (let c = 0; c < 3; c++) {
      const p = i * 3 + c;
      blended[p] = Math.round(blended[p]! + ((filled[p]! - blended[p]!) * w) / 255);
    }
  }
  return sharp(blended, { raw: { width: outW, height: outH, channels: 3 } })
    .composite([{ input: trimPng, left: bandXPx + ringPx, top: bandYPx + ringPx }])
    .png()
    .toBuffer();
}

/**
 * Pads packed RGB `inner` by `padX` / `padY` on each side with its edge
 * pixels carried outwards, averaged along the edge over a window that widens
 * with the distance from it ({@link SMEAR_PER_PX}). A plain copy turns every
 * pixel of the edge into a hard streak; smeared, a photo fades out softly the
 * way it would if it simply went on out of focus.
 */
function smearedStretch(
  inner: Buffer,
  innerW: number,
  innerH: number,
  padX: number,
  padY: number,
): Buffer {
  const outW = innerW + 2 * padX;
  const outH = innerH + 2 * padY;
  const out = Buffer.alloc(outW * outH * 3);
  for (let y = 0; y < innerH; y++) {
    inner.copy(out, ((y + padY) * outW + padX) * 3, y * innerW * 3, (y + 1) * innerW * 3);
  }

  const edgeMean = (sums: Float64Array, length: number, at: number, distance: number, c: number): number => {
    const r = Math.floor(distance * SMEAR_PER_PX);
    const from = Math.max(0, at - r);
    const to = Math.min(length - 1, at + r);
    return Math.round((sums[(to + 1) * 3 + c]! - sums[from * 3 + c]!) / (to - from + 1));
  };
  const put = (x: number, y: number, value: (c: number) => number): void => {
    const p = (y * outW + x) * 3;
    for (let c = 0; c < 3; c++) out[p + c] = value(c);
  };

  const topSums = prefixSums(inner, innerW, (i) => i * 3);
  const bottomSums = prefixSums(inner, innerW, (i) => ((innerH - 1) * innerW + i) * 3);
  for (let d = 1; d <= padY; d++) {
    for (let x = 0; x < outW; x++) {
      const at = Math.min(innerW - 1, Math.max(0, x - padX));
      put(x, padY - d, (c) => edgeMean(topSums, innerW, at, d, c));
      put(x, padY + innerH - 1 + d, (c) => edgeMean(bottomSums, innerW, at, d, c));
    }
  }
  const leftSums = prefixSums(inner, innerH, (i) => i * innerW * 3);
  const rightSums = prefixSums(inner, innerH, (i) => (i * innerW + innerW - 1) * 3);
  for (let d = 1; d <= padX; d++) {
    for (let y = 0; y < innerH; y++) {
      put(padX - d, padY + y, (c) => edgeMean(leftSums, innerH, y, d, c));
      put(padX + innerW - 1 + d, padY + y, (c) => edgeMean(rightSums, innerH, y, d, c));
    }
  }
  return out;
}

/** Running RGB sums over `length` pixels addressed by `offsetOf`; entry `i` sums pixels `< i`. */
function prefixSums(data: Buffer, length: number, offsetOf: (i: number) => number): Float64Array {
  const sums = new Float64Array((length + 1) * 3);
  for (let i = 0; i < length; i++) {
    const p = offsetOf(i);
    for (let c = 0; c < 3; c++) sums[(i + 1) * 3 + c] = sums[i * 3 + c]! + data[p + c]!;
  }
  return sums;
}

/**
 * Shifts the filled band's tone so it meets the artwork without a step.
 * Patches come from a little way inside, where a vignette or gradient may be
 * lighter or darker than at the very edge; for each edge position the mean
 * colour just inside and just outside the cut is compared (over a short
 * stretch along the edge, so texture averages out) and the band is offset by
 * the difference — a cheap stand-in for Photoshop's gradient-domain blend.
 */
function matchEdgeTone(image: RgbImage, rect: KnownRect): void {
  const { width, height, data } = image;
  const outsideDepth = (x: number, y: number): number =>
    Math.max(rect.left - x, x - (rect.right - 1), rect.top - y, y - (rect.bottom - 1));
  const offsets = new Map<number, [number, number, number]>();
  const offsetAt = (ex: number, ey: number): [number, number, number] => {
    const e = ey * width + ex;
    const cached = offsets.get(e);
    if (cached) return cached;
    const inside = [0, 0, 0];
    const outside = [0, 0, 0];
    let nIn = 0;
    let nOut = 0;
    for (let y = Math.max(0, ey - TONE_ALONG_PX); y <= Math.min(height - 1, ey + TONE_ALONG_PX); y++) {
      for (let x = Math.max(0, ex - TONE_ALONG_PX); x <= Math.min(width - 1, ex + TONE_ALONG_PX); x++) {
        const d = outsideDepth(x, y);
        if (d < -TONE_DEPTH_PX || d > TONE_DEPTH_PX || d === 0) continue;
        const p = (y * width + x) * 3;
        const sum = d < 0 ? inside : outside;
        for (let c = 0; c < 3; c++) sum[c]! += data[p + c]!;
        if (d < 0) nIn++;
        else nOut++;
      }
    }
    const offset: [number, number, number] = [0, 0, 0];
    if (nIn > 0 && nOut > 0) {
      for (let c = 0; c < 3; c++) offset[c] = inside[c]! / nIn - outside[c]! / nOut;
    }
    offsets.set(e, offset);
    return offset;
  };

  const shifted = Uint8Array.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (outsideDepth(x, y) <= 0) continue;
      const ex = Math.min(rect.right - 1, Math.max(rect.left, x));
      const ey = Math.min(rect.bottom - 1, Math.max(rect.top, y));
      const offset = offsetAt(ex, ey);
      const p = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        shifted[p + c] = Math.max(0, Math.min(255, Math.round(data[p + c]! + offset[c]!)));
      }
    }
  }
  data.set(shifted);
}

/** Known area of the work canvas; `right` and `bottom` are exclusive. */
interface KnownRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * How much of the content-aware fill to use for each band pixel (0–255; the
 * rest is a plain stretch of the edge). Where the picture is flat right at the
 * cut — a white or smoothly shaded background — the operator just carries
 * that colour out; inventing content there only drags in logos or text sitting
 * a few millimetres inside. So the weight follows how textured the strip at
 * the cut is next to each band pixel.
 */
function fillWeights(original: Uint8Array, width: number, height: number, rect: KnownRect): Uint8Array {
  const weights = new Uint8Array(width * height);
  const activity = new Float32Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) continue;
      const ex = Math.min(rect.right - 1, Math.max(rect.left, x));
      const ey = Math.min(rect.bottom - 1, Math.max(rect.top, y));
      const e = ey * width + ex;
      if (activity[e]! < 0) activity[e] = edgeActivity(original, width, rect, ex, ey);
      const texture = clamp01(
        (activity[e]! - FLAT_EDGE_ACTIVITY) / (TEXTURED_EDGE_ACTIVITY - FLAT_EDGE_ACTIVITY),
      );
      weights[y * width + x] = Math.round(255 * texture);
    }
  }
  return weights;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Mean luma step between neighbouring pixels in the strip along the cut around
 * an edge pixel: {@link EDGE_STRIP_ALONG_PX} either way along the edge and
 * {@link EDGE_STRIP_DEPTH_PX} deep, so content further inside does not count.
 */
function edgeActivity(data: Uint8Array, width: number, rect: KnownRect, ex: number, ey: number): number {
  let x0 = Math.max(rect.left, ex - EDGE_STRIP_ALONG_PX);
  let x1 = Math.min(rect.right - 1, ex + EDGE_STRIP_ALONG_PX);
  let y0 = Math.max(rect.top, ey - EDGE_STRIP_ALONG_PX);
  let y1 = Math.min(rect.bottom - 1, ey + EDGE_STRIP_ALONG_PX);
  if (ex === rect.left) x1 = Math.min(x1, rect.left + EDGE_STRIP_DEPTH_PX - 1);
  if (ex === rect.right - 1) x0 = Math.max(x0, rect.right - EDGE_STRIP_DEPTH_PX);
  if (ey === rect.top) y1 = Math.min(y1, rect.top + EDGE_STRIP_DEPTH_PX - 1);
  if (ey === rect.bottom - 1) y0 = Math.max(y0, rect.bottom - EDGE_STRIP_DEPTH_PX);

  const luma = (x: number, y: number): number => {
    const p = (y * width + x) * 3;
    return 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
  };
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < x1) {
        sum += Math.abs(luma(x, y) - luma(x + 1, y));
        count++;
      }
      if (y < y1) {
        sum += Math.abs(luma(x, y) - luma(x, y + 1));
        count++;
      }
    }
  }
  return count === 0 ? 0 : sum / count;
}
