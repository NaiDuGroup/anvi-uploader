/**
 * Content-aware fill, the non-AI kind Photoshop's "Fill → Content-Aware" is
 * built on: exemplar-based inpainting (Criminisi et al.). Unknown pixels are
 * filled from the outside of the known region inwards ("onion peel"), each
 * step pasting the best-matching patch found nearby in the original picture,
 * so sky continues as sky and grass as grass — no streaks, no reversed text.
 *
 * Pure and dependency-free: works on packed RGB bytes and a known-pixel mask.
 */

export interface RgbImage {
  width: number;
  height: number;
  /** Packed RGB, `width * height * 3` bytes. */
  data: Uint8Array;
}

export interface ContentAwareFillOptions {
  /** Patch half-size; the patch is `(2r + 1)²`. */
  patchRadius?: number;
  /** Half-size of the square searched around each target for a source patch. */
  searchRadius?: number;
  /**
   * Only sample patches centred at most this many pixels inside the known
   * region. Keeps the fill continuing what sits at the edge instead of
   * pulling in text or faces from deeper in the picture. Unlimited if unset.
   */
  sourceDepth?: number;
  /** Give up (returning false) after this many milliseconds. */
  timeBudgetMs?: number;
}

const DEFAULT_PATCH_RADIUS = 4;
const DEFAULT_SEARCH_RADIUS = 48;
const DEFAULT_TIME_BUDGET_MS = 20_000;
/** Coarse search step; the best hit is then refined at single-pixel steps. */
const COARSE_STEP = 2;

/**
 * Fills every pixel whose `known[i] === 0` in place. Source patches come only
 * from pixels that were known on entry. Returns false when no source patch
 * exists near some target or the time budget ran out; `image` is then left
 * partly filled and the caller should fall back to a simpler fill.
 */
export function contentAwareFill(
  image: RgbImage,
  known: Uint8Array,
  options: ContentAwareFillOptions = {},
): boolean {
  const { width, height, data } = image;
  const r = options.patchRadius ?? DEFAULT_PATCH_RADIUS;
  const searchRadius = options.searchRadius ?? DEFAULT_SEARCH_RADIUS;
  const deadline = Date.now() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);

  const filled = Uint8Array.from(known);
  const isSourceCenter = sourceCenters(known, width, height, r, options.sourceDepth ?? Infinity);

  for (;;) {
    const front = fillFront(filled, width, height);
    if (front.length === 0) return true;
    if (Date.now() > deadline) return false;

    // Strong edges first, so lines like the horizon cross into the band
    // before flat areas are filled around them.
    const strength = new Float32Array(front.length);
    for (let k = 0; k < front.length; k++) {
      strength[k] = gradientAt(data, filled, width, height, front[k]!);
    }
    const order = Array.from(front.keys()).sort((a, b) => strength[b]! - strength[a]!);

    for (const k of order) {
      const target = front[k]!;
      if (filled[target]) continue;
      const tx = target % width;
      const ty = (target - tx) / width;
      const source = bestSourcePatch(
        data,
        filled,
        isSourceCenter,
        width,
        height,
        tx,
        ty,
        r,
        searchRadius,
      );
      if (source < 0) return false;
      copyPatch(data, filled, width, height, tx, ty, source % width, Math.floor(source / width), r);
      if (Date.now() > deadline) return false;
    }
  }
}

/**
 * Centres whose whole patch lies inside the originally known pixels and that
 * are within `maxDepth` of an unknown one.
 */
function sourceCenters(
  known: Uint8Array,
  width: number,
  height: number,
  r: number,
  maxDepth: number,
): Uint8Array {
  const depth = Number.isFinite(maxDepth) ? depthFromUnknown(known, width, height) : null;
  const ok = new Uint8Array(width * height);
  for (let y = r; y < height - r; y++) {
    for (let x = r; x < width - r; x++) {
      let all = true;
      for (let dy = -r; dy <= r && all; dy++) {
        const row = (y + dy) * width;
        for (let dx = -r; dx <= r; dx++) {
          if (!known[row + x + dx]) {
            all = false;
            break;
          }
        }
      }
      if (all && (!depth || depth[y * width + x]! <= maxDepth)) ok[y * width + x] = 1;
    }
  }
  return ok;
}

/** Chessboard distance from each pixel to the nearest unknown one (two-pass). */
function depthFromUnknown(known: Uint8Array, width: number, height: number): Uint32Array {
  const far = width + height;
  const depth = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!known[i]) continue;
      let d = far;
      if (x > 0) d = Math.min(d, depth[i - 1]! + 1);
      if (y > 0) {
        d = Math.min(d, depth[i - width]! + 1);
        if (x > 0) d = Math.min(d, depth[i - width - 1]! + 1);
        if (x < width - 1) d = Math.min(d, depth[i - width + 1]! + 1);
      }
      depth[i] = d;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!known[i]) continue;
      let d = depth[i]!;
      if (x < width - 1) d = Math.min(d, depth[i + 1]! + 1);
      if (y < height - 1) {
        d = Math.min(d, depth[i + width]! + 1);
        if (x < width - 1) d = Math.min(d, depth[i + width + 1]! + 1);
        if (x > 0) d = Math.min(d, depth[i + width - 1]! + 1);
      }
      depth[i] = d;
    }
  }
  return depth;
}

/** Unknown pixels touching a known one (4-neighbourhood). */
function fillFront(filled: Uint8Array, width: number, height: number): number[] {
  const front: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (filled[i]) continue;
      if (
        (x > 0 && filled[i - 1]) ||
        (x < width - 1 && filled[i + 1]) ||
        (y > 0 && filled[i - width]) ||
        (y < height - 1 && filled[i + width])
      ) {
        front.push(i);
      }
    }
  }
  return front;
}

/** Luma gradient magnitude from the known neighbours of an unknown pixel. */
function gradientAt(
  data: Uint8Array,
  filled: Uint8Array,
  width: number,
  height: number,
  i: number,
): number {
  const x = i % width;
  const y = (i - x) / width;
  let best = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ax = x + dx;
      const ay = y + dy;
      const bx = x + 2 * dx;
      const by = y + 2 * dy;
      if ((dx === 0 && dy === 0) || bx < 0 || by < 0 || bx >= width || by >= height) continue;
      const a = ay * width + ax;
      const b = by * width + bx;
      if (!filled[a] || !filled[b]) continue;
      const g = Math.abs(luma(data, a) - luma(data, b));
      if (g > best) best = g;
    }
  }
  return best;
}

function luma(data: Uint8Array, i: number): number {
  const p = i * 3;
  return 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
}

function bestSourcePatch(
  data: Uint8Array,
  filled: Uint8Array,
  isSourceCenter: Uint8Array,
  width: number,
  height: number,
  tx: number,
  ty: number,
  r: number,
  searchRadius: number,
): number {
  const x0 = Math.max(r, tx - searchRadius);
  const x1 = Math.min(width - 1 - r, tx + searchRadius);
  const y0 = Math.max(r, ty - searchRadius);
  const y1 = Math.min(height - 1 - r, ty + searchRadius);

  let best = -1;
  let bestCost = Infinity;
  const consider = (sx: number, sy: number): void => {
    const s = sy * width + sx;
    if (!isSourceCenter[s]) return;
    const cost = patchCost(data, filled, width, height, tx, ty, sx, sy, r, bestCost);
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  };

  for (let sy = y0; sy <= y1; sy += COARSE_STEP) {
    for (let sx = x0; sx <= x1; sx += COARSE_STEP) consider(sx, sy);
  }
  if (best >= 0) {
    const bx = best % width;
    const by = (best - bx) / width;
    for (let sy = by - 1; sy <= by + 1; sy++) {
      for (let sx = bx - 1; sx <= bx + 1; sx++) {
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) consider(sx, sy);
      }
    }
  }
  return best;
}

/** SSD over the target patch's known pixels; stops early once above `limit`. */
function patchCost(
  data: Uint8Array,
  filled: Uint8Array,
  width: number,
  height: number,
  tx: number,
  ty: number,
  sx: number,
  sy: number,
  r: number,
  limit: number,
): number {
  let cost = 0;
  let count = 0;
  for (let dy = -r; dy <= r; dy++) {
    const y = ty + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx;
      if (x < 0 || x >= width) continue;
      const t = y * width + x;
      if (!filled[t]) continue;
      const tp = t * 3;
      const sp = ((sy + dy) * width + sx + dx) * 3;
      const d0 = data[tp]! - data[sp]!;
      const d1 = data[tp + 1]! - data[sp + 1]!;
      const d2 = data[tp + 2]! - data[sp + 2]!;
      cost += d0 * d0 + d1 * d1 + d2 * d2;
      count++;
    }
    if (cost >= limit) return Infinity;
  }
  return count === 0 ? Infinity : cost;
}

function copyPatch(
  data: Uint8Array,
  filled: Uint8Array,
  width: number,
  height: number,
  tx: number,
  ty: number,
  sx: number,
  sy: number,
  r: number,
): void {
  for (let dy = -r; dy <= r; dy++) {
    const y = ty + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx;
      if (x < 0 || x >= width) continue;
      const t = y * width + x;
      if (filled[t]) continue;
      const tp = t * 3;
      const sp = ((sy + dy) * width + sx + dx) * 3;
      data[tp] = data[sp]!;
      data[tp + 1] = data[sp + 1]!;
      data[tp + 2] = data[sp + 2]!;
      filled[t] = 1;
    }
  }
}
