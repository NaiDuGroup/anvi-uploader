/**
 * Content-aware fill, the non-AI kind behind Photoshop's "Fill → Content-Aware":
 * PatchMatch (Barnes et al. 2009) inside a multi-scale, coherence-maximising
 * completion (Wexler et al. 2007). Every patch touching the hole is matched to
 * a patch of the picture, and each hole pixel becomes the vote of all patches
 * covering it; repeated coarse to fine, the matches settle so lines and
 * textures carry on through the hole instead of being stitched from pieces.
 * The final picture is blended in the gradient domain (Darabi et al. 2012,
 * "Image Melding"), so pieces taken from lighter or darker spots leave no
 * tone steps.
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
  /** Half-size of the window around each target where sources are drawn. */
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

const DEFAULT_PATCH_RADIUS = 3;
const DEFAULT_SEARCH_RADIUS = 64;
const DEFAULT_TIME_BUDGET_MS = 20_000;
/** EM iterations at the coarsest level; finer levels start from a good guess. */
const COARSE_ITERATIONS = 12;
const FINE_ITERATIONS = 4;
/** Random-search tries per target per PatchMatch pass. */
const RANDOM_INIT_TRIES = 24;

interface Level {
  width: number;
  height: number;
  /** Packed RGB as floats. */
  data: Float32Array;
  known: Uint8Array;
  isSource: Uint8Array;
  /** Indices of the known source centres, for falling back to any source. */
  sources: Int32Array;
}

interface Field {
  /** Patch centres whose patch overlaps the hole. */
  targets: Int32Array;
  /** Pixel index → position in `targets`, or -1. */
  targetAt: Int32Array;
  /** Best source centre for each target. */
  match: Int32Array;
  cost: Float32Array;
}

/**
 * Fills every pixel whose `known[i] === 0` in place. Source patches come only
 * from pixels that were known on entry. Returns false when no source patch
 * exists or the time budget ran out; `image` is then left untouched and the
 * caller should fall back to a simpler fill.
 */
export function contentAwareFill(
  image: RgbImage,
  known: Uint8Array,
  options: ContentAwareFillOptions = {},
): boolean {
  const r = options.patchRadius ?? DEFAULT_PATCH_RADIUS;
  const searchRadius = options.searchRadius ?? DEFAULT_SEARCH_RADIUS;
  const sourceDepth = options.sourceDepth ?? Infinity;
  const deadline = Date.now() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const random = seededRandom(0x9e3779b9);

  const full: Level = makeLevel(
    image.width,
    image.height,
    Float32Array.from(image.data),
    known,
    r,
    sourceDepth,
  );
  if (full.sources.length === 0) return false;
  if (!known.includes(0)) return true;

  // Halve until the hole is only a few patches thick, but not so far that a
  // patch reaches deeper into the picture than `sourceDepth` allows.
  const pyramid: Level[] = [full];
  for (;;) {
    const top = pyramid[pyramid.length - 1]!;
    if (holeThickness(top) <= 2 * r || Math.min(top.width, top.height) < 8 * (2 * r + 1)) break;
    const nextDepth = sourceDepth / 2 ** pyramid.length;
    if (nextDepth < 2 * r) break;
    const next = downscale(top, r, nextDepth);
    if (next.sources.length === 0) break;
    pyramid.push(next);
  }

  let field: Field | null = null;
  for (let l = pyramid.length - 1; l >= 0; l--) {
    const level = pyramid[l]!;
    const levelSearch = Math.max(4 * r, Math.round(searchRadius / 2 ** l));
    if (field === null) {
      seedHole(level);
      field = newField(level, r);
      for (let t = 0; t < field.targets.length; t++) {
        randomMatch(level, field, t, levelSearch, r, random);
      }
    } else {
      field = upsampleField(pyramid[l + 1]!, field, level, r, levelSearch, random);
      vote(level, field, r);
    }
    const iterations = l === pyramid.length - 1 ? COARSE_ITERATIONS : FINE_ITERATIONS;
    for (let it = 0; it < iterations; it++) {
      patchMatch(level, field, r, levelSearch, it % 2 === 1, random);
      vote(level, field, r);
      if (Date.now() > deadline) return false;
    }
  }

  if (field !== null) {
    const guide = voteGradients(full, field, r);
    if (!solvePoisson(full, guide, deadline)) return false;
  }

  for (let i = 0; i < known.length; i++) {
    if (known[i]) continue;
    for (let c = 0; c < 3; c++) {
      image.data[i * 3 + c] = Math.max(0, Math.min(255, Math.round(full.data[i * 3 + c]!)));
    }
  }
  return true;
}

function makeLevel(
  width: number,
  height: number,
  data: Float32Array,
  known: Uint8Array,
  r: number,
  sourceDepth: number,
): Level {
  const isSource = sourceCenters(known, width, height, r, sourceDepth);
  const sources: number[] = [];
  for (let i = 0; i < isSource.length; i++) if (isSource[i]) sources.push(i);
  return { width, height, data, known, isSource, sources: Int32Array.from(sources) };
}

/** Half-size level; a pixel is known only if all four parents were. */
function downscale(level: Level, r: number, sourceDepth: number): Level {
  const width = Math.floor(level.width / 2);
  const height = Math.floor(level.height / 2);
  const data = new Float32Array(width * height * 3);
  const known = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let all = 1;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const p = (2 * y + dy) * level.width + 2 * x + dx;
          if (!level.known[p]) all = 0;
          for (let c = 0; c < 3; c++) data[i * 3 + c] += level.data[p * 3 + c]! / 4;
        }
      }
      known[i] = all;
    }
  }
  return makeLevel(width, height, data, known, r, sourceDepth);
}

/** Largest chessboard distance from a hole pixel to the known region. */
function holeThickness(level: Level): number {
  const depth = chessboardDistance(level.known, level.width, level.height, 0);
  let max = 0;
  for (let i = 0; i < depth.length; i++) if (!level.known[i] && depth[i]! > max) max = depth[i]!;
  return max;
}

/** First guess for the coarsest hole: peel inwards, averaging filled neighbours. */
function seedHole(level: Level): void {
  const { width, height, data } = level;
  const filled = Uint8Array.from(level.known);
  for (let changed = true; changed; ) {
    changed = false;
    const front: number[] = [];
    for (let i = 0; i < filled.length; i++) {
      if (filled[i]) continue;
      const x = i % width;
      const y = (i - x) / width;
      const sum = [0, 0, 0];
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (!filled[j]) continue;
          for (let c = 0; c < 3; c++) sum[c]! += data[j * 3 + c]!;
          n++;
        }
      }
      if (n === 0) continue;
      for (let c = 0; c < 3; c++) data[i * 3 + c] = sum[c]! / n;
      front.push(i);
    }
    for (const i of front) filled[i] = 1;
    changed = front.length > 0;
  }
}

function newField(level: Level, r: number): Field {
  const { width, height, known } = level;
  const nearHole = chessboardDistance(known, width, height, 1);
  const targets: number[] = [];
  const targetAt = new Int32Array(width * height).fill(-1);
  for (let y = r; y < height - r; y++) {
    for (let x = r; x < width - r; x++) {
      const i = y * width + x;
      if (!known[i] || nearHole[i]! <= r) {
        targetAt[i] = targets.length;
        targets.push(i);
      }
    }
  }
  return {
    targets: Int32Array.from(targets),
    targetAt,
    match: new Int32Array(targets.length),
    cost: new Float32Array(targets.length),
  };
}

function randomMatch(
  level: Level,
  field: Field,
  t: number,
  searchRadius: number,
  r: number,
  random: () => number,
): void {
  const target = field.targets[t]!;
  const tx = target % level.width;
  const ty = (target - tx) / level.width;
  let best = -1;
  let bestCost = Infinity;
  for (let k = 0; k < RANDOM_INIT_TRIES; k++) {
    const sx = tx + Math.round((random() * 2 - 1) * searchRadius);
    const sy = ty + Math.round((random() * 2 - 1) * searchRadius);
    if (sx < 0 || sy < 0 || sx >= level.width || sy >= level.height) continue;
    const s = sy * level.width + sx;
    if (!level.isSource[s]) continue;
    const cost = patchCost(level, target, s, r, bestCost);
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  if (best < 0) {
    best = nearestSource(level, tx, ty);
    bestCost = patchCost(level, target, best, r, Infinity);
  }
  field.match[t] = best;
  field.cost[t] = bestCost;
}

/** Closest source centre, scanning outward ring by ring. */
function nearestSource(level: Level, tx: number, ty: number): number {
  const { width, height, isSource } = level;
  for (let d = 0; d < Math.max(width, height); d++) {
    for (let y = Math.max(0, ty - d); y <= Math.min(height - 1, ty + d); y++) {
      const ring = y === ty - d || y === ty + d;
      for (let x = Math.max(0, tx - d); x <= Math.min(width - 1, tx + d); x += ring ? 1 : 2 * d || 1) {
        if (isSource[y * width + x]) return y * width + x;
      }
    }
  }
  return level.sources[0]!;
}

/** Coarse matches doubled onto the finer level, then checked against it. */
function upsampleField(
  coarse: Level,
  coarseField: Field,
  level: Level,
  r: number,
  searchRadius: number,
  random: () => number,
): Field {
  const field = newField(level, r);
  for (let t = 0; t < field.targets.length; t++) {
    const target = field.targets[t]!;
    const tx = target % level.width;
    const ty = (target - tx) / level.width;
    const cx = Math.min(coarse.width - 1, tx >> 1);
    const cy = Math.min(coarse.height - 1, ty >> 1);
    const ct = coarseField.targetAt[cy * coarse.width + cx]!;
    let source = -1;
    if (ct >= 0) {
      const cs = coarseField.match[ct]!;
      const csx = cs % coarse.width;
      const csy = (cs - csx) / coarse.width;
      const sx = 2 * csx + (tx & 1);
      const sy = 2 * csy + (ty & 1);
      if (sx < level.width && sy < level.height && level.isSource[sy * level.width + sx]) {
        source = sy * level.width + sx;
      }
    }
    if (source >= 0) {
      field.match[t] = source;
      field.cost[t] = Infinity;
    } else {
      randomMatch(level, field, t, searchRadius, r, random);
    }
  }
  // Costs against the freshly voted picture are refreshed by the next pass.
  return field;
}

/** One PatchMatch sweep: propagate neighbours' matches, then random search. */
function patchMatch(
  level: Level,
  field: Field,
  r: number,
  searchRadius: number,
  reverse: boolean,
  random: () => number,
): void {
  const { width, height, isSource } = level;
  const { targets, targetAt, match, cost } = field;
  const step = reverse ? -1 : 1;
  const n = targets.length;

  const tryCandidate = (t: number, target: number, s: number): void => {
    if (s < 0 || s >= isSource.length || !isSource[s]) return;
    if (s === match[t]) return;
    const c = patchCost(level, target, s, r, cost[t]!);
    if (c < cost[t]!) {
      cost[t] = c;
      match[t] = s;
    }
  };

  for (let k = 0; k < n; k++) {
    const t = reverse ? n - 1 - k : k;
    const target = targets[t]!;
    const tx = target % width;
    const ty = (target - tx) / width;
    cost[t] = patchCost(level, target, match[t]!, r, Infinity);

    // Propagation: the neighbour's source, shifted by the same step.
    for (const [dx, dy] of [
      [-step, 0],
      [0, -step],
    ] as const) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nt = targetAt[ny * width + nx]!;
      if (nt < 0) continue;
      const ns = match[nt]!;
      const sx = (ns % width) - dx;
      const sy = Math.floor(ns / width) - dy;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      tryCandidate(t, target, sy * width + sx);
    }

    // Random search in shrinking windows around the current best.
    for (let radius = searchRadius; radius >= 1; radius >>= 1) {
      const bx = match[t]! % width;
      const by = Math.floor(match[t]! / width);
      const sx = bx + Math.round((random() * 2 - 1) * radius);
      const sy = by + Math.round((random() * 2 - 1) * radius);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      if (Math.abs(sx - tx) > searchRadius || Math.abs(sy - ty) > searchRadius) continue;
      tryCandidate(t, target, sy * width + sx);
    }
  }
}

/**
 * Re-paints the hole: each pixel is the weighted mean of what the patches
 * covering it propose, better-matching patches weighing more.
 */
function vote(level: Level, field: Field, r: number): void {
  const { width, data, known } = level;
  const { targets, match, cost } = field;
  const sum = new Float32Array(data.length);
  const weight = new Float32Array(known.length);

  const sorted = Float32Array.from(cost.filter(Number.isFinite)).sort();
  const scale = Math.max(1e-3, sorted.length ? sorted[Math.floor(sorted.length * 0.75)]! : 1);

  for (let t = 0; t < targets.length; t++) {
    const target = targets[t]!;
    const source = match[t]!;
    const w = Number.isFinite(cost[t]!) ? Math.exp(-cost[t]! / scale) : 1;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const q = target + dy * width + dx;
        if (known[q]) continue;
        const p = source + dy * width + dx;
        for (let c = 0; c < 3; c++) sum[q * 3 + c] += w * data[p * 3 + c]!;
        weight[q] += w;
      }
    }
  }
  for (let q = 0; q < known.length; q++) {
    if (known[q] || weight[q] === 0) continue;
    for (let c = 0; c < 3; c++) data[q * 3 + c] = sum[q * 3 + c]! / weight[q]!;
  }
}

interface GradientField {
  /** `I(x + 1, y) − I(x, y)` per pixel and channel. */
  gx: Float32Array;
  /** `I(x, y + 1) − I(x, y)` per pixel and channel. */
  gy: Float32Array;
}

/**
 * Like `vote`, but the patches vote for the differences between neighbouring
 * pixels instead of their colours (Darabi et al. 2012, "Image Melding"). Two
 * patches copied from spots of slightly different brightness then agree on
 * the texture and leave no step where they meet; `solvePoisson` turns the
 * differences back into colours. Edges no patch votes on keep the colour
 * vote's own differences.
 */
function voteGradients(level: Level, field: Field, r: number): GradientField {
  const { width, height, data, known } = level;
  const { targets, match, cost } = field;
  const gx = new Float32Array(data.length);
  const gy = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        if (x + 1 < width) gx[i + c] = data[i + 3 + c]! - data[i + c]!;
        if (y + 1 < height) gy[i + c] = data[i + width * 3 + c]! - data[i + c]!;
      }
    }
  }

  const sumX = new Float32Array(data.length);
  const sumY = new Float32Array(data.length);
  const weightX = new Float32Array(known.length);
  const weightY = new Float32Array(known.length);
  const sorted = Float32Array.from(cost.filter(Number.isFinite)).sort();
  const scale = Math.max(1e-3, sorted.length ? sorted[Math.floor(sorted.length * 0.75)]! : 1);

  for (let t = 0; t < targets.length; t++) {
    const target = targets[t]!;
    const source = match[t]!;
    const w = Number.isFinite(cost[t]!) ? Math.exp(-cost[t]! / scale) : 1;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const q = target + dy * width + dx;
        const p = source + dy * width + dx;
        if (dx < r && (!known[q] || !known[q + 1])) {
          for (let c = 0; c < 3; c++) sumX[q * 3 + c] += w * (data[(p + 1) * 3 + c]! - data[p * 3 + c]!);
          weightX[q] += w;
        }
        if (dy < r && (!known[q] || !known[q + width])) {
          for (let c = 0; c < 3; c++) {
            sumY[q * 3 + c] += w * (data[(p + width) * 3 + c]! - data[p * 3 + c]!);
          }
          weightY[q] += w;
        }
      }
    }
  }
  for (let q = 0; q < known.length; q++) {
    for (let c = 0; c < 3; c++) {
      if (weightX[q]! > 0) gx[q * 3 + c] = sumX[q * 3 + c]! / weightX[q]!;
      if (weightY[q]! > 0) gy[q * 3 + c] = sumY[q * 3 + c]! / weightY[q]!;
    }
  }
  return { gx, gy };
}

const POISSON_MAX_ITERATIONS = 600;
const POISSON_TOLERANCE = 1e-3;

/**
 * Rebuilds the hole from `guide`: solves Δu = div(guide) over the hole pixels
 * with the known pixels as fixed boundary values (and no flux across the
 * canvas edge), by conjugate gradients started from the current colours.
 * Returns false when the time budget ran out.
 */
function solvePoisson(level: Level, guide: GradientField, deadline: number): boolean {
  const { width, height, data, known } = level;
  const unknowns: number[] = [];
  const indexOf = new Int32Array(known.length).fill(-1);
  for (let q = 0; q < known.length; q++) {
    if (known[q]) continue;
    indexOf[q] = unknowns.length;
    unknowns.push(q);
  }
  const n = unknowns.length;
  if (n === 0) return true;

  // Per unknown: its in-canvas neighbours (pixel index, or -1 beyond the edge).
  const neighbours = new Int32Array(n * 4).fill(-1);
  const diagonal = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const q = unknowns[k]!;
    const x = q % width;
    const y = (q - x) / width;
    if (x + 1 < width) neighbours[k * 4] = q + 1;
    if (x > 0) neighbours[k * 4 + 1] = q - 1;
    if (y + 1 < height) neighbours[k * 4 + 2] = q + width;
    if (y > 0) neighbours[k * 4 + 3] = q - width;
    for (let j = 0; j < 4; j++) if (neighbours[k * 4 + j]! >= 0) diagonal[k]++;
  }

  const apply = (v: Float64Array, out: Float64Array): void => {
    for (let k = 0; k < n; k++) {
      let s = diagonal[k]! * v[k]!;
      for (let j = 0; j < 4; j++) {
        const m = neighbours[k * 4 + j]!;
        if (m >= 0 && indexOf[m]! >= 0) s -= v[indexOf[m]!]!;
      }
      out[k] = s;
    }
  };

  const u = new Float64Array(n);
  const b = new Float64Array(n);
  const residual = new Float64Array(n);
  const direction = new Float64Array(n);
  const product = new Float64Array(n);
  const dot = (a: Float64Array, c: Float64Array): number => {
    let s = 0;
    for (let k = 0; k < n; k++) s += a[k]! * c[k]!;
    return s;
  };

  for (let c = 0; c < 3; c++) {
    for (let k = 0; k < n; k++) {
      const q = unknowns[k]!;
      u[k] = data[q * 3 + c]!;
      // Σ over neighbours m of (u_q − u_m) = Σ guided differences; known u_m move right.
      let s = 0;
      const right = neighbours[k * 4]!;
      const left = neighbours[k * 4 + 1]!;
      const down = neighbours[k * 4 + 2]!;
      const up = neighbours[k * 4 + 3]!;
      if (right >= 0) s -= guide.gx[q * 3 + c]!;
      if (left >= 0) s += guide.gx[left * 3 + c]!;
      if (down >= 0) s -= guide.gy[q * 3 + c]!;
      if (up >= 0) s += guide.gy[up * 3 + c]!;
      for (const m of [right, left, down, up]) {
        if (m >= 0 && known[m]) s += data[m * 3 + c]!;
      }
      b[k] = s;
    }

    apply(u, product);
    for (let k = 0; k < n; k++) residual[k] = b[k]! - product[k]!;
    direction.set(residual);
    let rr = dot(residual, residual);
    const stop = POISSON_TOLERANCE * POISSON_TOLERANCE * Math.max(1, dot(b, b));
    for (let it = 0; it < POISSON_MAX_ITERATIONS && rr > stop; it++) {
      apply(direction, product);
      const alpha = rr / dot(direction, product);
      for (let k = 0; k < n; k++) {
        u[k] += alpha * direction[k]!;
        residual[k] -= alpha * product[k]!;
      }
      const next = dot(residual, residual);
      const beta = next / rr;
      rr = next;
      for (let k = 0; k < n; k++) direction[k] = residual[k]! + beta * direction[k]!;
      if ((it & 31) === 31 && Date.now() > deadline) return false;
    }
    for (let k = 0; k < n; k++) data[unknowns[k]! * 3 + c] = u[k]!;
  }
  return true;
}

/** Mean squared RGB difference over the whole patch; Infinity once above `limit`. */
function patchCost(level: Level, target: number, source: number, r: number, limit: number): number {
  const { width, data } = level;
  const side = 2 * r + 1;
  const bound = limit * side * side;
  let cost = 0;
  for (let dy = -r; dy <= r; dy++) {
    const tRow = (target + dy * width) * 3;
    const sRow = (source + dy * width) * 3;
    for (let k = -r * 3; k < (r + 1) * 3; k++) {
      const d = data[tRow + k]! - data[sRow + k]!;
      cost += d * d;
    }
    if (cost >= bound) return Infinity;
  }
  return cost / (side * side);
}

/**
 * Centres whose whole patch lies inside the known pixels and that are within
 * `maxDepth` of an unknown one.
 */
function sourceCenters(
  known: Uint8Array,
  width: number,
  height: number,
  r: number,
  maxDepth: number,
): Uint8Array {
  const depth = chessboardDistance(known, width, height, 1);
  const ok = new Uint8Array(width * height);
  for (let y = r; y < height - r; y++) {
    for (let x = r; x < width - r; x++) {
      const i = y * width + x;
      const d = depth[i]!;
      // Depth counts from the hole; a patch fits when the hole is beyond r.
      if (known[i] && d > r && d <= maxDepth) ok[i] = 1;
    }
  }
  return ok;
}

/**
 * Chessboard distance from each pixel to the nearest pixel whose `known`
 * value differs from `from` (two passes). With `from = 1` this is the depth of
 * known pixels below the hole edge; with `from = 0`, of hole pixels.
 */
function chessboardDistance(known: Uint8Array, width: number, height: number, from: 0 | 1): Uint32Array {
  const far = width + height;
  const depth = new Uint32Array(width * height);
  const inside = (i: number): boolean => (known[i] ? 1 : 0) === from;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!inside(i)) continue;
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
      if (!inside(i)) continue;
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

/** Small deterministic PRNG (mulberry32) so the same file always fills the same way. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
