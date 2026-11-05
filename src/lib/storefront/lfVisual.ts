import type { ShopLfProduct } from "./largeFormat";

/**
 * Pure geometry for the wide-format product page visuals: the «real size»
 * scene (the product to scale next to a 170 cm person) and the 3D canvas
 * (box UVs onto the same mirrored wrap the flat preview / print file uses).
 * Client-safe, no DOM, everything in centimetres.
 */

/** Height of the scale figure, cm. */
export const LF_SCALE_PERSON_CM = 170;
/** Width of the scale figure's outline at 170 cm, cm. */
export const LF_SCALE_PERSON_WIDTH_CM = 47;
/** Centre height of a picture / banner on a wall, cm (common hanging height). */
export const LF_SCALE_WALL_CENTRE_CM = 150;

/**
 * Depth of the canvas stretcher frame (подрамник), cm. Not in the price list
 * or the DB: 2 cm is the usual frame for a 4 cm wrap (2 cm side + 2 cm onto
 * the back). TO APPROVE with the workshop.
 */
export const LF_CANVAS_STRETCHER_DEPTH_CM = 2;
/** Width of a stretcher bar seen from the back, cm. */
export const LF_CANVAS_STRETCHER_BAR_CM = 4;

/** Roll-up: the cassette (base) the banner comes out of, cm. */
export const LF_ROLLUP_CASSETTE_CM = { height: 9, overhang: 2 } as const;
/** X-banner: the bottom of the banner above the floor (the frame's legs), cm. */
export const LF_XBANNER_LIFT_CM = 14;

/** Room right of the product for «100 см», in font sizes. */
const RIGHT_LABEL_FONTS = 4.6;

export interface LfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A line in scene coordinates (SVG: y grows downwards). */
export interface LfSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LfScaleScene {
  /** viewBox, cm. */
  width: number;
  height: number;
  floorY: number;
  /** Top-left of the 170 cm figure (its box is LF_SCALE_PERSON_WIDTH_CM × 170). */
  person: { x: number; y: number };
  /** The printed product as seen (canvas: the face). */
  product: LfRect;
  /** Canvas: the visible side edge (drawn to the right of the face). */
  depthCm: number;
  /** Roll-up cassette. */
  cassette: LfRect | null;
  /** Thin stand parts: the roll-up pole, the X-banner frame. */
  poles: LfSegment[];
  /** Dimension label anchors. */
  widthLabel: { x: number; y: number };
  heightLabel: { x: number; y: number };
  /** Font size, cm, so labels read ~12 px in a ~1.5:1 box. */
  fontCm: number;
}

/** Where a product of this kind sits relative to the floor. */
export function lfScaleBottomCm(product: ShopLfProduct, heightCm: number): number {
  if (product === "rollup") return LF_ROLLUP_CASSETTE_CM.height;
  if (product === "xbanner") return LF_XBANNER_LIFT_CM;
  // Banner, film, poster, canvas: centred at ~150 cm on a wall, never below the floor.
  return Math.max(0, LF_SCALE_WALL_CENTRE_CM - heightCm / 2);
}

/**
 * The «real size» scene: the person on the left, a gap, the product (on its
 * stand for roll-ups / X-banners). Sizes are real centimetres; the SVG scales
 * the whole scene to fit, so the figure always stays in proportion.
 */
export function lfScaleScene(product: ShopLfProduct, widthCm: number, heightCm: number): LfScaleScene {
  const w: number = Math.max(1, widthCm);
  const h: number = Math.max(1, heightCm);
  const depth: number = product === "canvas" ? LF_CANVAS_STRETCHER_DEPTH_CM : 0;
  const margin: number = Math.max(12, Math.max(w, h) * 0.04);
  const gap: number = Math.max(25, Math.min(60, w * 0.15));
  const bottom: number = lfScaleBottomCm(product, h);
  const top: number = bottom + h;
  // Room for the width label under the product and the height label on its right.
  const labelRoom: number = Math.max(18, Math.max(w, top) * 0.08);
  const sceneTop: number = Math.max(LF_SCALE_PERSON_CM, top) + margin;
  const floorY: number = sceneTop;
  const productX: number = margin + LF_SCALE_PERSON_WIDTH_CM + gap;
  // Under the floor: the width label when the product sits low, else a small strip.
  const height: number = floorY + (bottom < labelRoom * 1.4 ? labelRoom * 1.2 : margin * 0.6);
  // Right of the product: the height label (~4.6 font sizes); the font follows the scene size.
  const width0: number = productX + w + depth + margin * 0.5;
  const fontCm: number = Math.max(height * 0.05, (0.038 * width0) / (1 - 0.038 * RIGHT_LABEL_FONTS));
  const width: number = width0 + fontCm * RIGHT_LABEL_FONTS;
  const productRect: LfRect = { x: productX, y: floorY - top, w, h };

  let cassette: LfRect | null = null;
  const poles: LfSegment[] = [];
  if (product === "rollup") {
    const o = LF_ROLLUP_CASSETTE_CM.overhang;
    cassette = { x: productX - o, y: floorY - LF_ROLLUP_CASSETTE_CM.height, w: w + 2 * o, h: LF_ROLLUP_CASSETTE_CM.height };
    // The telescopic pole behind the banner, a little above its top bar.
    poles.push({ x1: productX + w / 2, y1: floorY - LF_ROLLUP_CASSETTE_CM.height, x2: productX + w / 2, y2: floorY - top - 1 });
  } else if (product === "xbanner") {
    // The X-frame: two diagonals corner to corner, legs from the bottom corners to the floor.
    const l = productX;
    const r = productX + w;
    const t = floorY - top;
    const b = floorY - bottom;
    const spread: number = Math.min(18, w * 0.2);
    // The arms run behind the banner; their tips hook the corners and stick out a little.
    const len: number = Math.hypot(w, h);
    const ex: number = (w / len) * 4;
    const ey: number = (h / len) * 4;
    poles.push({ x1: l - ex, y1: t - ey, x2: r, y2: b }, { x1: r + ex, y1: t - ey, x2: l, y2: b });
    poles.push({ x1: l, y1: b, x2: l - spread, y2: floorY }, { x1: r, y1: b, x2: r + spread, y2: floorY });
  }

  const belowProduct: number = floorY - bottom;
  const widthLabelY: number =
    bottom < labelRoom * 1.4 ? floorY + labelRoom * 0.75 : belowProduct + fontCm * 1.4;
  return {
    width,
    height,
    floorY,
    person: { x: margin, y: floorY - LF_SCALE_PERSON_CM },
    product: productRect,
    depthCm: depth,
    cassette,
    poles,
    widthLabel: { x: productX + w / 2, y: widthLabelY },
    heightLabel: { x: productX + w + depth + fontCm * 0.8, y: productRect.y + h / 2 },
    fontCm,
  };
}

/**
 * The part of an image (px) shown when it covers a box (SVG `xMidYMid slice`):
 * the crop is centred and keeps the box proportions.
 */
export function coverCrop(imgW: number, imgH: number, boxW: number, boxH: number): { sx: number; sy: number; sw: number; sh: number } {
  const box: number = boxW / boxH;
  const img: number = imgW / imgH;
  if (img > box) {
    const sw: number = imgH * box;
    return { sx: (imgW - sw) / 2, sy: 0, sw, sh: imgH };
  }
  const sh: number = imgW / box;
  return { sx: 0, sy: (imgH - sh) / 2, sw: imgW, sh };
}

/** One side of the 3D canvas box. */
export type CanvasBoxFace = "front" | "back" | "left" | "right" | "top" | "bottom";

export interface CanvasBoxDims {
  /** Face, cm. */
  widthCm: number;
  heightCm: number;
  /** Frame depth, cm (≤ wrap). */
  depthCm: number;
  /** Mirrored wrap printed around the face, cm (the print is face + 2 × wrap). */
  wrapCm: number;
}

/**
 * Where a point of the box surface lands on the print (cm from the print's
 * top-left; the print is the face plus the mirrored wrap on every side, as
 * in `LfPreview` and the workshop's file). The box is centred at the origin,
 * x right, y up, the face at z = +depth/2. Each side shows the strip of the
 * wrap that folds over it, starting at the fold line.
 */
export function canvasBoxPrintPoint(face: CanvasBoxFace, x: number, y: number, z: number, d: CanvasBoxDims): { u: number; v: number } {
  const { widthCm: W, heightCm: H, depthCm: D, wrapCm: w } = d;
  const fold: number = Math.max(0, Math.min(D, D / 2 - z)); // distance from the front edge
  const u: number = w + (x + W / 2);
  const v: number = w + (H / 2 - y);
  switch (face) {
    case "right":
      return { u: w + W + fold, v };
    case "left":
      return { u: w - fold, v };
    case "top":
      return { u, v: w - fold };
    case "bottom":
      return { u, v: w + H + fold };
    default:
      return { u, v };
  }
}

/** Texture UV (0..1, v up as in three.js with flipY) of a print point. */
export function canvasPrintUv(p: { u: number; v: number }, d: CanvasBoxDims): [number, number] {
  const tw: number = d.widthCm + 2 * d.wrapCm;
  const th: number = d.heightCm + 2 * d.wrapCm;
  return [p.u / tw, 1 - p.v / th];
}

/** Box face by its outward normal (BoxGeometry groups: +x, −x, +y, −y, +z, −z). */
export const CANVAS_BOX_FACES: readonly CanvasBoxFace[] = ["right", "left", "top", "bottom", "front", "back"];

/**
 * Mirrored copies of the face onto the wrap (canvas 2D transforms), the same
 * as `LfPreview`: `[a, b, c, d, e, f]` in cm, applied before drawing the face
 * at (wrap, wrap). The clip is the strip of that side.
 */
export function canvasWrapMirrors(widthCm: number, heightCm: number, wrapCm: number): { clip: LfRect; m: [number, number, number, number, number, number] }[] {
  const W = widthCm;
  const H = heightCm;
  const w = wrapCm;
  if (w <= 0) return [];
  return [
    { clip: { x: 0, y: w, w, h: H }, m: [-1, 0, 0, 1, 2 * w, 0] },
    { clip: { x: w + W, y: w, w, h: H }, m: [-1, 0, 0, 1, 2 * (w + W), 0] },
    { clip: { x: w, y: 0, w: W, h: w }, m: [1, 0, 0, -1, 0, 2 * w] },
    { clip: { x: w, y: w + H, w: W, h: w }, m: [1, 0, 0, -1, 0, 2 * (w + H)] },
  ];
}
