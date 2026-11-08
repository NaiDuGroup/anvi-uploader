/**
 * Where the ink is in an artwork: the bounding box of «ink» pixels of a raster,
 * so a dealer who sent a whole-lid file with a small logo sees the real print
 * size (UV is priced by the print area). Pure — the browser reads the pixels
 * (`localInkBox.ts`), tests pass synthetic data.
 *
 * Ink = alpha above {@link INK_MIN_ALPHA} and not near-white (a pixel whose
 * every channel is above {@link INK_WHITE_LEVEL} is background paper / white).
 */

/** RGBA pixels, row by row (same shape as the browser's `ImageData`). */
export interface RgbaPixels {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface InkBoxPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InkBoxResult {
  /** Ink bounding box in the pixels given; null when the image has no ink at all. */
  box: InkBoxPx | null;
  /** The box covers (almost) the whole image: nothing to suggest. */
  fullBleed: boolean;
  /** Opaque near-white corners: the background is white (could be real white ink on a dark item). */
  whiteBackground: boolean;
}

export const INK_MIN_ALPHA = 10;
export const INK_WHITE_LEVEL = 245;
/** The box is «the whole image» when it leaves less than this share free on each axis. */
const FULL_BLEED_SHARE = 0.97;

function isInk(d: RgbaPixels["data"], i: number): boolean {
  if (d[i + 3]! <= INK_MIN_ALPHA) return false;
  return !(d[i]! > INK_WHITE_LEVEL && d[i + 1]! > INK_WHITE_LEVEL && d[i + 2]! > INK_WHITE_LEVEL);
}

function isOpaqueWhite(d: RgbaPixels["data"], i: number): boolean {
  return d[i + 3]! > 200 && d[i]! > INK_WHITE_LEVEL && d[i + 1]! > INK_WHITE_LEVEL && d[i + 2]! > INK_WHITE_LEVEL;
}

export function findInkBox(img: RgbaPixels): InkBoxResult {
  const { data, width, height } = img;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (!isInk(data, row + x * 4)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const corner = (x: number, y: number): boolean => isOpaqueWhite(data, (y * width + x) * 4);
  const whiteBackground =
    width > 0 &&
    height > 0 &&
    [corner(0, 0), corner(width - 1, 0), corner(0, height - 1), corner(width - 1, height - 1)].filter(Boolean)
      .length >= 3;
  if (maxX < 0) return { box: null, fullBleed: false, whiteBackground };
  const box: InkBoxPx = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const fullBleed = box.width >= width * FULL_BLEED_SHARE && box.height >= height * FULL_BLEED_SHARE;
  return { box, fullBleed, whiteBackground };
}

/**
 * Ink box size in cm: `scale` = original pixels per analysed pixel (the image
 * was downscaled for speed), `dpi` the file's resolution (300 when unknown).
 * Rounded to 0.1 cm.
 */
export function inkBoxCm(box: InkBoxPx, scale: number, dpi: number): { widthCm: number; heightCm: number } {
  const cm = (px: number): number => Math.round(((px * scale) / dpi) * 2.54 * 10) / 10;
  return { widthCm: cm(box.width), heightCm: cm(box.height) };
}
