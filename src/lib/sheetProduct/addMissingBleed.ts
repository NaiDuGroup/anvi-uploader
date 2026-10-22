/**
 * Generates the bleed for artwork made at the finished (trim) size — what the
 * operator used to do by hand in Photoshop: shrink the picture evenly so it
 * sits `bleedCm` inside the cut (text set right at the edge would otherwise be
 * trimmed off), grow the canvas to trim + bleed and "Fill → Content-Aware"
 * everything around it, so the picture carries on past the cut (see
 * `contentAwareFill`). The output keeps the trim + bleed size. A mirror would reverse text near
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
 * Widest band the content-aware fill works at (safe margin + bleed is about
 * 4–6 mm, 48–72 px at 300 DPI). Larger bands are filled on a scaled-down copy;
 * anything softer than the artwork shows as a line along it, so
 * print-resolution files are filled 1:1.
 */
const WORK_BAND_PX = 72;
/** Smallest artwork side (at work scale) worth sampling patches from. */
const MIN_WORK_SIDE_PX = 192;
/**
 * Outermost artwork pixels (at work scale) refilled along with the band.
 * Exported files often end in a pixel or two of light or dark seam; sampled as-is,
 * it would be copied into the band as streaks.
 */
const EDGE_RING_WORK_PX = 2;
const PATCH_RADIUS = 3;
/**
 * Edge texture (see `edgeActivity`) below which the band is a plain stretch,
 * and above which it is fully content-aware; blended between.
 */
const FLAT_EDGE_ACTIVITY = 0.5;
const TEXTURED_EDGE_ACTIVITY = 1.5;
const EDGE_STRIP_ALONG_PX = 4;
/**
 * A soft, out-of-focus photo has tiny pixel steps but its colour still drifts
 * along the edge; the luma spread over this longer stretch, divided by
 * {@link SPREAD_PER_ACTIVITY}, counts as texture too.
 */
const EDGE_SPREAD_ALONG_PX = 16;
const SPREAD_PER_ACTIVITY = 4;
/** Half-width of the along-edge averaging per pixel of distance from the cut. */
const SMEAR_PER_PX = 0.5;
const EDGE_STRIP_DEPTH_PX = 2;
/** How deep into the artwork (at work scale) the fill may borrow patches from. */
const SOURCE_DEPTH_WORK_PX = 20;
/** About 15–20 s for a 15 × 7 cm side at 300 DPI; larger sheets scale with the perimeter. */
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

  // Pull the picture one bleed inside the cut so text set right at the edge
  // survives the knife: scale it down evenly until the tighter axis clears
  // the bleed on both sides, and centre it; the output keeps trim + bleed.
  const outW = widthPx + 2 * leftRightPx;
  const outH = heightPx + 2 * topBottomPx;
  const shrink = Math.min(
    (widthPx - 2 * leftRightPx) / widthPx,
    (heightPx - 2 * topBottomPx) / heightPx,
  );
  const contentW = Math.max(1, Math.round(widthPx * shrink));
  const contentH = Math.max(1, Math.round(heightPx * shrink));
  const left = Math.round((outW - contentW) / 2);
  const top = Math.round((outH - contentH) / 2);
  const padding: Padding = {
    left,
    top,
    right: outW - contentW - left,
    bottom: outH - contentH - top,
  };
  const content = await sharp(normalized, SHARP_OPTS)
    .flatten({ background: WHITE })
    .removeAlpha()
    .resize(contentW, contentH, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  const extended =
    (await contentAwareExtend(content, contentW, contentH, padding)) ??
    (await sharp(content, SHARP_OPTS)
      .extend({ ...padding, extendWith: "copy" })
      .png()
      .toBuffer());
  return { buffer: extended, generated: true };
}

/** Pixels added on each side of a picture. */
interface Padding {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Pads the (already shrunk) artwork by `padding`, filled content-aware. The
 * fill runs on a copy scaled so the thinnest side is at most
 * {@link WORK_BAND_PX} wide; the artwork is then laid back pixel for pixel,
 * except the outermost seam (see {@link EDGE_RING_WORK_PX}). Null when the
 * artwork is too small to sample or the fill gave up, so the caller can fall
 * back.
 */
async function contentAwareExtend(
  content: Buffer,
  widthPx: number,
  heightPx: number,
  padding: Padding,
): Promise<Buffer | null> {
  const scale = Math.min(
    1,
    WORK_BAND_PX / Math.min(padding.left, padding.top, padding.right, padding.bottom),
  );
  if (widthPx * scale < MIN_WORK_SIDE_PX || heightPx * scale < MIN_WORK_SIDE_PX) {
    return null;
  }
  const workW = Math.max(1, Math.round(widthPx * scale));
  const workH = Math.max(1, Math.round(heightPx * scale));
  const workPad: Padding = {
    left: Math.max(1, Math.round(padding.left * scale)),
    top: Math.max(1, Math.round(padding.top * scale)),
    right: Math.max(1, Math.round(padding.right * scale)),
    bottom: Math.max(1, Math.round(padding.bottom * scale)),
  };

  const small = await sharp(content, SHARP_OPTS)
    .resize(workW, workH, { fit: "fill" })
    .raw()
    .toBuffer();

  const canvasW = workW + workPad.left + workPad.right;
  const canvasH = workH + workPad.top + workPad.bottom;
  const image: RgbImage = {
    width: canvasW,
    height: canvasH,
    data: new Uint8Array(canvasW * canvasH * 3),
  };
  const known = new Uint8Array(canvasW * canvasH);
  const ring = EDGE_RING_WORK_PX;
  for (let y = 0; y < workH; y++) {
    const srcRow = y * workW * 3;
    const dstRow = ((y + workPad.top) * canvasW + workPad.left) * 3;
    image.data.set(small.subarray(srcRow, srcRow + workW * 3), dstRow);
    if (y >= ring && y < workH - ring) {
      const rowStart = (y + workPad.top) * canvasW + workPad.left;
      known.fill(1, rowStart + ring, rowStart + workW - ring);
    }
  }
  const knownRect: KnownRect = {
    left: workPad.left + ring,
    top: workPad.top + ring,
    right: workPad.left + workW - ring,
    bottom: workPad.top + workH - ring,
  };

  const weights = fillWeights(image.data, canvasW, canvasH, knownRect);
  // All-flat edges (plain backgrounds) need no fill: the stretch is the answer.
  if (weights.some((w) => w > 0)) {
    const fillOptions = {
      patchRadius: PATCH_RADIUS,
      sourceDepth: SOURCE_DEPTH_WORK_PX,
      timeBudgetMs: FILL_TIME_BUDGET_MS,
    };
    if (!contentAwareFill(image, known, fillOptions)) return null;
  }

  const outW = widthPx + padding.left + padding.right;
  const outH = heightPx + padding.top + padding.bottom;
  // The refilled seam is a pixel or two of the artwork: keep the rest exact.
  const ringPx = Math.ceil(ring / scale);
  const exact = sharp(content, SHARP_OPTS).extract({
    left: ringPx,
    top: ringPx,
    width: widthPx - 2 * ringPx,
    height: heightPx - 2 * ringPx,
  });
  const [filled, weightMap, inner, exactPng] = await Promise.all([
    sharp(Buffer.from(image.data.buffer), { raw: { width: canvasW, height: canvasH, channels: 3 } })
      .resize(outW, outH, { fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer(),
    sharp(Buffer.from(weights.buffer), { raw: { width: canvasW, height: canvasH, channels: 1 } })
      .resize(outW, outH, { fit: "fill", kernel: "linear" })
      .extractChannel(0)
      .raw()
      .toBuffer(),
    exact.clone().raw().toBuffer(),
    exact.clone().png().toBuffer(),
  ]);
  const blended = smearedStretch(inner, widthPx - 2 * ringPx, heightPx - 2 * ringPx, {
    left: padding.left + ringPx,
    top: padding.top + ringPx,
    right: padding.right + ringPx,
    bottom: padding.bottom + ringPx,
  });

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
    .composite([{ input: exactPng, left: padding.left + ringPx, top: padding.top + ringPx }])
    .png()
    .toBuffer();
}

/**
 * Pads packed RGB `inner` by `pad` with its edge pixels carried outwards,
 * averaged along the edge over a window that widens with the distance from it
 * ({@link SMEAR_PER_PX}). A plain copy turns every pixel of the edge into a
 * hard streak; smeared, a photo fades out softly the way it would if it
 * simply went on out of focus.
 */
function smearedStretch(inner: Buffer, innerW: number, innerH: number, pad: Padding): Buffer {
  const outW = innerW + pad.left + pad.right;
  const outH = innerH + pad.top + pad.bottom;
  const out = Buffer.alloc(outW * outH * 3);
  for (let y = 0; y < innerH; y++) {
    inner.copy(out, ((y + pad.top) * outW + pad.left) * 3, y * innerW * 3, (y + 1) * innerW * 3);
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
  for (let x = 0; x < outW; x++) {
    const at = Math.min(innerW - 1, Math.max(0, x - pad.left));
    for (let d = 1; d <= pad.top; d++) {
      put(x, pad.top - d, (c) => edgeMean(topSums, innerW, at, d, c));
    }
    for (let d = 1; d <= pad.bottom; d++) {
      put(x, pad.top + innerH - 1 + d, (c) => edgeMean(bottomSums, innerW, at, d, c));
    }
  }
  const leftSums = prefixSums(inner, innerH, (i) => i * innerW * 3);
  const rightSums = prefixSums(inner, innerH, (i) => (i * innerW + innerW - 1) * 3);
  for (let y = 0; y < innerH; y++) {
    for (let d = 1; d <= pad.left; d++) {
      put(pad.left - d, pad.top + y, (c) => edgeMean(leftSums, innerH, y, d, c));
    }
    for (let d = 1; d <= pad.right; d++) {
      put(pad.left + innerW - 1 + d, pad.top + y, (c) => edgeMean(rightSums, innerH, y, d, c));
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
 * How textured the strip along the cut is around an edge pixel,
 * {@link EDGE_STRIP_DEPTH_PX} deep so content further inside does not count:
 * the larger of the mean luma step between neighbours (over
 * {@link EDGE_STRIP_ALONG_PX} either way) and the luma spread (standard
 * deviation over {@link EDGE_SPREAD_ALONG_PX}, scaled by
 * {@link SPREAD_PER_ACTIVITY}).
 */
function edgeActivity(data: Uint8Array, width: number, rect: KnownRect, ex: number, ey: number): number {
  const luma = (x: number, y: number): number => {
    const p = (y * width + x) * 3;
    return 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
  };

  const steps = edgeStrip(rect, ex, ey, EDGE_STRIP_ALONG_PX);
  let stepSum = 0;
  let stepCount = 0;
  for (let y = steps.y0; y <= steps.y1; y++) {
    for (let x = steps.x0; x <= steps.x1; x++) {
      if (x < steps.x1) {
        stepSum += Math.abs(luma(x, y) - luma(x + 1, y));
        stepCount++;
      }
      if (y < steps.y1) {
        stepSum += Math.abs(luma(x, y) - luma(x, y + 1));
        stepCount++;
      }
    }
  }

  const spread = edgeStrip(rect, ex, ey, EDGE_SPREAD_ALONG_PX);
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = spread.y0; y <= spread.y1; y++) {
    for (let x = spread.x0; x <= spread.x1; x++) {
      const l = luma(x, y);
      sum += l;
      sumSq += l * l;
      count++;
    }
  }
  const mean = sum / count;
  const deviation = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  return Math.max(stepCount === 0 ? 0 : stepSum / stepCount, deviation / SPREAD_PER_ACTIVITY);
}

interface Strip {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Inclusive strip inside `rect` along the edge at (ex, ey): `along` either way, the edge depth deep. */
function edgeStrip(rect: KnownRect, ex: number, ey: number, along: number): Strip {
  const strip: Strip = {
    x0: Math.max(rect.left, ex - along),
    x1: Math.min(rect.right - 1, ex + along),
    y0: Math.max(rect.top, ey - along),
    y1: Math.min(rect.bottom - 1, ey + along),
  };
  if (ex === rect.left) strip.x1 = Math.min(strip.x1, rect.left + EDGE_STRIP_DEPTH_PX - 1);
  if (ex === rect.right - 1) strip.x0 = Math.max(strip.x0, rect.right - EDGE_STRIP_DEPTH_PX);
  if (ey === rect.top) strip.y1 = Math.min(strip.y1, rect.top + EDGE_STRIP_DEPTH_PX - 1);
  if (ey === rect.bottom - 1) strip.y0 = Math.max(strip.y0, rect.bottom - EDGE_STRIP_DEPTH_PX);
  return strip;
}
