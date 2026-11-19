/**
 * Workshop sheet layout: pieces of several lines (and orders) of one sheet
 * material (VATMAN A1) packed together on whole sheets. Pure, used by the
 * board's sheet layout modal and the PDF.
 *
 * - Printable area = sheet minus the margin on every side; placements are in
 *   sheet coordinates (top-left corner of the sheet, margin included).
 * - Pieces sit edge to edge by default ({@link LF_SHEET_PACK_GAP_CM}).
 * - Several heuristics are tried, the fewest sheets win:
 *     • MaxRects (best short side fit, first sheet that takes the piece) with
 *       several piece orderings;
 *     • «line blocks»: every size gets its full sheets from the single-line
 *       optimum ({@link packLfSheets}, e.g. 4 × A3 per A1), the remainders are
 *       pooled with MaxRects.
 */
import type { GroupTilePackPlacement, GroupTilePackTile } from "./groupTilePack";
import {
  LF_SHEET_PACK_GAP_CM,
  lfSheetPrintableCm,
  packLfSheets,
  type LfSheetSpec,
} from "./lfSheet";

const EPS = 1e-6;

export interface LfSheetLayoutSheet {
  /** 0-based sheet index. */
  index: number;
  placements: GroupTilePackPlacement[];
}

export interface LfSheetLayoutResult {
  sheet: LfSheetSpec;
  gapCm: number;
  sheets: LfSheetLayoutSheet[];
  /** Pieces that fit the printable area in no orientation. */
  unplacedTileIds: string[];
}

type FreeRect = { x: number; y: number; w: number; h: number };

/** One MaxRects bin (printable area of one sheet, origin at the printable corner). */
class MaxRectsBin {
  free: FreeRect[];
  placed: Array<{ tile: GroupTilePackTile; x: number; y: number; w: number; h: number; rotated: boolean }> = [];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly gap: number,
  ) {
    // Pieces are inflated by the gap; the bin by the gap too, so edge pieces need none.
    this.free = [{ x: 0, y: 0, w: width + gap, h: height + gap }];
  }

  /** Best short side fit position, or null. */
  find(tile: GroupTilePackTile): { x: number; y: number; w: number; h: number; rotated: boolean; score: number } | null {
    const g = this.gap;
    const options: Array<{ w: number; h: number; rotated: boolean }> = [{ w: tile.widthCm, h: tile.heightCm, rotated: false }];
    if (tile.allowRotate && Math.abs(tile.widthCm - tile.heightCm) > EPS) {
      options.push({ w: tile.heightCm, h: tile.widthCm, rotated: true });
    }
    let best: { x: number; y: number; w: number; h: number; rotated: boolean; score: number; score2: number } | null = null;
    for (const r of this.free) {
      for (const o of options) {
        const iw = o.w + g;
        const ih = o.h + g;
        if (iw > r.w + EPS || ih > r.h + EPS) continue;
        const short = Math.min(r.w - iw, r.h - ih);
        const long = Math.max(r.w - iw, r.h - ih);
        if (!best || short < best.score - EPS || (Math.abs(short - best.score) <= EPS && long < best.score2 - EPS)) {
          best = { x: r.x, y: r.y, w: o.w, h: o.h, rotated: o.rotated, score: short, score2: long };
        }
      }
    }
    return best;
  }

  place(tile: GroupTilePackTile, pos: { x: number; y: number; w: number; h: number; rotated: boolean }): void {
    const g = this.gap;
    const used: FreeRect = { x: pos.x, y: pos.y, w: pos.w + g, h: pos.h + g };
    const next: FreeRect[] = [];
    for (const r of this.free) {
      if (
        used.x >= r.x + r.w - EPS || used.x + used.w <= r.x + EPS ||
        used.y >= r.y + r.h - EPS || used.y + used.h <= r.y + EPS
      ) {
        next.push(r);
        continue;
      }
      if (used.x > r.x + EPS) next.push({ x: r.x, y: r.y, w: used.x - r.x, h: r.h });
      if (used.x + used.w < r.x + r.w - EPS) next.push({ x: used.x + used.w, y: r.y, w: r.x + r.w - used.x - used.w, h: r.h });
      if (used.y > r.y + EPS) next.push({ x: r.x, y: r.y, w: r.w, h: used.y - r.y });
      if (used.y + used.h < r.y + r.h - EPS) next.push({ x: r.x, y: used.y + used.h, w: r.w, h: r.y + r.h - used.y - used.h });
    }
    // Drop free rects contained in another one.
    this.free = next.filter(
      (a, i) =>
        !next.some(
          (b, j) =>
            j !== i &&
            a.x >= b.x - EPS && a.y >= b.y - EPS &&
            a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS &&
            // Of two equal rects keep the first.
            !(j > i && Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS && Math.abs(a.w - b.w) <= EPS && Math.abs(a.h - b.h) <= EPS),
        ),
    );
    this.placed.push({ tile, ...pos });
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function fitsPrintable(t: GroupTilePackTile, pw: number, ph: number): boolean {
  if (t.widthCm <= pw + EPS && t.heightCm <= ph + EPS) return true;
  return t.allowRotate && t.heightCm <= pw + EPS && t.widthCm <= ph + EPS;
}

type Sheet = GroupTilePackPlacement[];

/** MaxRects over growing sheets; `seed` sheets (already full) come first and stay untouched. */
function maxRectsPack(tiles: readonly GroupTilePackTile[], spec: LfSheetSpec, gap: number, seed: Sheet[]): Sheet[] {
  const p = lfSheetPrintableCm(spec);
  const marginCm = Math.max(0, spec.marginMm) / 10;
  const bins: MaxRectsBin[] = [];
  for (const tile of tiles) {
    let placed = false;
    for (const bin of bins) {
      const pos = bin.find(tile);
      if (pos) {
        bin.place(tile, pos);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const bin = new MaxRectsBin(p.widthCm, p.heightCm, gap);
      const pos = bin.find(tile);
      if (!pos) continue; // filtered out by the caller
      bin.place(tile, pos);
      bins.push(bin);
    }
  }
  return [
    ...seed,
    ...bins.map((bin) =>
      bin.placed.map((pl) => ({
        tileId: pl.tile.id,
        label: pl.tile.label,
        xCm: round(marginCm + pl.x),
        yCm: round(marginCm + pl.y),
        widthCm: pl.w,
        heightCm: pl.h,
        rotated: pl.rotated,
      })),
    ),
  ];
}

const ORDERINGS: Array<(a: GroupTilePackTile, b: GroupTilePackTile) => number> = [
  (a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm,
  (a, b) => Math.max(b.widthCm, b.heightCm) - Math.max(a.widthCm, a.heightCm),
  (a, b) => Math.min(b.widthCm, b.heightCm) - Math.min(a.widthCm, a.heightCm),
  (a, b) => b.heightCm - a.heightCm,
  (a, b) => b.widthCm - a.widthCm,
];

/** Full sheets per piece size from the single-line optimum; the rest is returned for pooling. */
function lineBlocks(
  tiles: readonly GroupTilePackTile[],
  spec: LfSheetSpec,
  gap: number,
): { full: Sheet[]; rest: GroupTilePackTile[] } {
  const bySize = new Map<string, GroupTilePackTile[]>();
  const rest: GroupTilePackTile[] = [];
  for (const t of tiles) {
    if (!t.allowRotate) {
      rest.push(t);
      continue;
    }
    const key = `${t.widthCm}x${t.heightCm}`;
    const list = bySize.get(key);
    if (list) list.push(t);
    else bySize.set(key, [t]);
  }
  const full: Sheet[] = [];
  for (const list of bySize.values()) {
    const first = list[0]!;
    const pack = packLfSheets({ itemWidthCm: first.widthCm, itemHeightCm: first.heightCm, quantity: list.length, sheet: spec, gapCm: gap });
    if (!pack.ok || pack.layout.perSheet < 1) {
      rest.push(...list);
      continue;
    }
    const perSheet = pack.layout.perSheet;
    const fullCount = Math.floor(list.length / perSheet);
    for (let s = 0; s < fullCount; s++) {
      const sheet: Sheet = [];
      for (let k = 0; k < perSheet; k++) {
        const i = s * perSheet + k;
        const pl = pack.layout.placements[i]!;
        const tile = list[i]!;
        sheet.push({
          tileId: tile.id,
          label: tile.label,
          xCm: pl.xCm,
          yCm: pl.yCm,
          widthCm: pl.widthCm,
          heightCm: pl.heightCm,
          rotated: pl.rotated,
        });
      }
      full.push(sheet);
    }
    rest.push(...list.slice(fullCount * perSheet));
  }
  return { full, rest };
}

/**
 * Pack `tiles` (one per printed piece) on as few sheets as possible. Pieces
 * keep their input order inside a sheet's placement list only loosely; the
 * result is deterministic for a given input.
 */
export function packTilesOnSheets(
  tiles: readonly GroupTilePackTile[],
  spec: LfSheetSpec,
  gapCm: number = LF_SHEET_PACK_GAP_CM,
): LfSheetLayoutResult {
  const gap = Math.max(0, Number.isFinite(gapCm) ? gapCm : 0);
  const p = lfSheetPrintableCm(spec);
  const unplacedTileIds: string[] = [];
  const fitting: GroupTilePackTile[] = [];
  for (const t of tiles) {
    if (t.widthCm > 0 && t.heightCm > 0 && fitsPrintable(t, p.widthCm, p.heightCm)) fitting.push(t);
    else unplacedTileIds.push(t.id);
  }

  const candidates: Sheet[][] = [];
  for (const cmp of ORDERINGS) {
    candidates.push(maxRectsPack([...fitting].sort(cmp), spec, gap, []));
  }
  const blocks = lineBlocks(fitting, spec, gap);
  if (blocks.full.length > 0) {
    for (const cmp of ORDERINGS) {
      candidates.push(maxRectsPack([...blocks.rest].sort(cmp), spec, gap, blocks.full));
    }
  }
  let best: Sheet[] = [];
  for (const c of candidates) {
    if (best.length === 0 || c.length < best.length) best = c;
  }
  return {
    sheet: spec,
    gapCm: gap,
    sheets: best.map((placements, index) => ({ index, placements })),
    unplacedTileIds,
  };
}

/** Sheets if every line were laid out on its own sheets (no pooling between lines). */
export function sheetsWithoutPooling(
  tiles: readonly (GroupTilePackTile & { lineId?: string })[],
  spec: LfSheetSpec,
  gapCm: number = LF_SHEET_PACK_GAP_CM,
): number {
  const byLine = new Map<string, GroupTilePackTile[]>();
  for (const t of tiles) {
    const sep = t.id.lastIndexOf("::");
    const key = t.lineId ?? (sep > 0 ? t.id.slice(0, sep) : t.id);
    const list = byLine.get(key);
    if (list) list.push(t);
    else byLine.set(key, [t]);
  }
  let total = 0;
  for (const list of byLine.values()) total += packTilesOnSheets(list, spec, gapCm).sheets.length;
  return total;
}

/** True when a w×h piece fits the printable area as is (no rotation). */
export function pieceFitsSheetAs(widthCm: number, heightCm: number, spec: LfSheetSpec): boolean {
  const p = lfSheetPrintableCm(spec);
  return widthCm <= p.widthCm + EPS && heightCm <= p.heightCm + EPS;
}
