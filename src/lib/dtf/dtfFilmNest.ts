/**
 * Shape-aware nesting of DTF transfers on a film strip.
 *
 * Every transfer is a grid of 1 mm cells (1 = ink, 0 = transparent), so
 * transparent canvas margins and the empty corners of round or irregular
 * artwork can be used by neighbours. Two transfers keep at least `gapCells`
 * between their inked cells (the film is cut apart by hand afterwards).
 * Placement is greedy: biggest first, each one at the position and rotation
 * that keeps its bottom edge lowest, then leftmost.
 */

/** Size of one grid cell (cm). */
export const NEST_CELL_CM = 0.1;

export type NestRotation = 0 | 90 | 180 | 270;

export interface NestShape {
  widthCells: number;
  heightCells: number;
  /** Row-major, `widthCells × heightCells`; 1 = ink. */
  cells: Uint8Array;
}

export interface NestItem {
  id: string;
  /** Items with the same key share one shape (copies of one transfer). */
  shapeKey: string;
  shape: NestShape;
  rotations: readonly NestRotation[];
}

export interface NestPlacement {
  id: string;
  /** Top-left of the (rotated) shape grid on the film, in cells. */
  xCells: number;
  yCells: number;
  widthCells: number;
  heightCells: number;
  /** Clockwise. */
  rotation: NestRotation;
}

export interface NestResult {
  placements: NestPlacement[];
  /** Items wider than the film in every allowed rotation. */
  unplacedIds: string[];
  /** Film used, in cells (bottom of the lowest transfer). */
  lengthCells: number;
}

/** Rotate a shape clockwise. */
export function rotateShape(shape: NestShape, rotation: NestRotation): NestShape {
  if (rotation === 0) return shape;
  const { widthCells: w, heightCells: h, cells } = shape;
  const turned = rotation !== 180;
  const nw = turned ? h : w;
  const nh = turned ? w : h;
  const out = new Uint8Array(nw * nh);
  for (let ny = 0; ny < nh; ny++) {
    for (let nx = 0; nx < nw; nx++) {
      let ox: number;
      let oy: number;
      if (rotation === 90) {
        ox = ny;
        oy = h - 1 - nx;
      } else if (rotation === 180) {
        ox = w - 1 - nx;
        oy = h - 1 - ny;
      } else {
        ox = w - 1 - ny;
        oy = nx;
      }
      out[ny * nw + nx] = cells[oy * w + ox];
    }
  }
  return { widthCells: nw, heightCells: nh, cells: out };
}

/** A full rectangle of ink (opaque photos, vector PDFs). */
export function solidShape(widthCells: number, heightCells: number): NestShape {
  return { widthCells, heightCells, cells: new Uint8Array(widthCells * heightCells).fill(1) };
}

/** One rotation of a shape, prepared for collision tests. */
interface Variant {
  rotation: NestRotation;
  w: number;
  h: number;
  cells: Uint8Array;
  /** Shape grown by the gap: flat triples (row, firstCol, lastCol) relative to the shape's top-left. */
  grownRuns: Int32Array;
  /** Longest inked run per row: a cheap test that a film row can take the row at all. */
  rowLongestRun: Int32Array;
}

function discOffsets(radius: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius + radius) out.push([dx, dy]);
    }
  }
  return out;
}

function buildVariant(shape: NestShape, rotation: NestRotation, gap: number): Variant {
  const s = rotateShape(shape, rotation);
  const { widthCells: w, heightCells: h, cells } = s;

  const gw = w + 2 * gap;
  const gh = h + 2 * gap;
  const grown = new Uint8Array(gw * gh);
  const offsets = discOffsets(gap);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!cells[y * w + x]) continue;
      grown[(y + gap) * gw + x + gap] = 1;
      if (gap === 0) continue;
      // Interior cells are covered by their neighbours' discs.
      const edge =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !cells[y * w + x - 1] || !cells[y * w + x + 1] ||
        !cells[(y - 1) * w + x] || !cells[(y + 1) * w + x];
      if (!edge) continue;
      for (const [dx, dy] of offsets) grown[(y + gap + dy) * gw + x + gap + dx] = 1;
    }
  }

  const runs: number[] = [];
  for (let y = 0; y < gh; y++) {
    let x = 0;
    while (x < gw) {
      if (!grown[y * gw + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < gw && grown[y * gw + x]) x++;
      runs.push(y - gap, start - gap, x - 1 - gap);
    }
  }

  const rowLongestRun = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let best = 0;
    let run = 0;
    for (let x = 0; x < w; x++) {
      run = cells[y * w + x] ? run + 1 : 0;
      if (run > best) best = run;
    }
    rowLongestRun[y] = best;
  }

  return { rotation, w, h, cells, grownRuns: Int32Array.from(runs), rowLongestRun };
}

/** Film occupancy: one row of cells per 1 mm of film, with prefix sums for O(1) range tests. */
class Film {
  readonly width: number;
  private occ: Uint8Array[] = [];
  private prefix: Int32Array[] = [];
  /** Longest free run per row. */
  private longestFree: number[] = [];

  constructor(width: number) {
    this.width = width;
  }

  get rows(): number {
    return this.occ.length;
  }

  private ensureRows(n: number): void {
    while (this.occ.length < n) {
      this.occ.push(new Uint8Array(this.width));
      this.prefix.push(new Int32Array(this.width + 1));
      this.longestFree.push(this.width);
    }
  }

  rowAccepts(row: number, runLength: number): boolean {
    return row >= this.occ.length || this.longestFree[row] >= runLength;
  }

  collides(v: Variant, x: number, y: number): boolean {
    const runs = v.grownRuns;
    const last = this.width - 1;
    for (let i = 0; i < runs.length; i += 3) {
      const row = y + runs[i];
      if (row < 0 || row >= this.occ.length) continue;
      const lo = Math.max(0, x + runs[i + 1]);
      const hi = Math.min(last, x + runs[i + 2]);
      if (lo > hi) continue;
      const p = this.prefix[row];
      if (p[hi + 1] - p[lo] > 0) return true;
    }
    return false;
  }

  fits(v: Variant, x: number, y: number): boolean {
    for (let r = 0; r < v.h; r++) {
      if (!this.rowAccepts(y + r, v.rowLongestRun[r])) return false;
    }
    return !this.collides(v, x, y);
  }

  place(v: Variant, x: number, y: number): void {
    this.ensureRows(y + v.h);
    for (let r = 0; r < v.h; r++) {
      const row = this.occ[y + r];
      for (let c = 0; c < v.w; c++) {
        if (v.cells[r * v.w + c]) row[x + c] = 1;
      }
      const p = this.prefix[y + r];
      let best = 0;
      let run = 0;
      for (let c = 0; c < this.width; c++) {
        p[c + 1] = p[c] + row[c];
        run = row[c] ? 0 : run + 1;
        if (run > best) best = run;
      }
      this.longestFree[y + r] = best;
    }
  }
}

function inkCount(shape: NestShape): number {
  let n = 0;
  for (let i = 0; i < shape.cells.length; i++) n += shape.cells[i];
  return n;
}

/** Nest the items on a film `filmWidthCells` wide, keeping `gapCells` between inked cells. */
export function nestShapes(
  items: readonly NestItem[],
  filmWidthCells: number,
  gapCells: number,
): NestResult {
  const gap = Math.max(0, Math.round(gapCells));
  const variantsByKey = new Map<string, Variant[]>();
  const areaByKey = new Map<string, number>();
  for (const item of items) {
    if (variantsByKey.has(item.shapeKey)) continue;
    const rotations: NestRotation[] = item.rotations.length > 0 ? [...new Set(item.rotations)] : [0];
    variantsByKey.set(
      item.shapeKey,
      rotations.map((r) => buildVariant(item.shape, r, gap)),
    );
    areaByKey.set(item.shapeKey, item.shape.widthCells * item.shape.heightCells + inkCount(item.shape));
  }

  // Biggest first; copies of one transfer stay together; stable otherwise.
  const order = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (areaByKey.get(b.item.shapeKey) ?? 0) - (areaByKey.get(a.item.shapeKey) ?? 0) ||
        a.item.shapeKey.localeCompare(b.item.shapeKey) ||
        a.index - b.index,
    );

  const film = new Film(filmWidthCells);
  const placements: NestPlacement[] = [];
  const unplacedIds: string[] = [];
  let lengthCells = 0;

  for (const { item } of order) {
    const variants = (variantsByKey.get(item.shapeKey) ?? []).filter((v) => v.w <= filmWidthCells);
    let best: { v: Variant; x: number; y: number } | null = null;

    for (const v of variants) {
      const bestBottom = best ? best.y + best.v.h : Number.POSITIVE_INFINITY;
      // A gap below the last used row the film is empty, so x = 0 always fits there.
      const maxY = Math.min(film.rows + gap, bestBottom - v.h);
      let found: { x: number; y: number } | null = null;
      for (let y = 0; y <= maxY && !found; y++) {
        for (let x = 0; x + v.w <= filmWidthCells; x++) {
          if (film.fits(v, x, y)) {
            found = { x, y };
            break;
          }
        }
      }
      if (!found) continue;
      const bottom = found.y + v.h;
      if (!best || bottom < best.y + best.v.h || (bottom === best.y + best.v.h && found.x < best.x)) {
        best = { v, ...found };
      }
    }

    if (!best) {
      unplacedIds.push(item.id);
      continue;
    }
    film.place(best.v, best.x, best.y);
    placements.push({
      id: item.id,
      xCells: best.x,
      yCells: best.y,
      widthCells: best.v.w,
      heightCells: best.v.h,
      rotation: best.v.rotation,
    });
    lengthCells = Math.max(lengthCells, best.y + best.v.h);
  }

  return { placements, unplacedIds, lengthCells };
}
