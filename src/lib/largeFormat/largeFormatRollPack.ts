import {
  LF_ROLL_PACK_ALGORITHM_VERSION,
  LF_ROLL_PACK_MAX_QUANTITY,
} from "./largeFormatRollConstants";

const EPS = 1e-6;

export interface LfRollPlacement {
  xCm: number;
  yCm: number;
  crossCm: number;
  alongCm: number;
  rotated: boolean;
}

export interface LargeFormatRollPackLayout {
  algorithmVersion: number;
  printableWidthCm: number;
  nominalRollWidthMeters: number;
  calculatedLinearMeters: number;
  totalAlongCm: number;
  placements: LfRollPlacement[];
  orientationsUsed: ReadonlyArray<{
    crossCm: number;
    alongCm: number;
    rotated: boolean;
  }>;
}

export type LargeFormatRollPackResult =
  | { ok: true; layout: LargeFormatRollPackLayout }
  | { ok: false; code: "does_not_fit" | "quantity_too_large" };

type Orientation = { cross: number; along: number; rotated: boolean };

function buildOrientations(
  printWidthCm: number,
  printHeightCm: number,
  printableWidthCm: number,
): Orientation[] {
  const w = printWidthCm;
  const h = printHeightCm;
  const pw = printableWidthCm;
  const cand: Orientation[] = [];
  if (w <= pw + EPS) cand.push({ cross: w, along: h, rotated: false });
  if (h <= pw + EPS) {
    cand.push({ cross: h, along: w, rotated: Math.abs(w - h) > EPS });
  }
  const seen = new Set<string>();
  const out: Orientation[] = [];
  for (const o of cand) {
    const key = `${o.cross}:${o.along}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(o);
    }
  }
  return out;
}

function rowBetter(
  candidateTotalAlong: number,
  bestTotalAlong: number,
  kA: number,
  kB: number,
  bestKa: number,
  bestKb: number,
): boolean {
  if (candidateTotalAlong + EPS < bestTotalAlong) return true;
  if (candidateTotalAlong > bestTotalAlong + EPS) return false;
  if (kA !== bestKa) return kA > bestKa;
  return kB < bestKb;
}
export function computeLargeFormatRollLayout(input: {
  printableWidthCm: number;
  nominalRollWidthMeters: number;
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
  maxQuantity?: number;
}): LargeFormatRollPackResult {
  const maxQ = input.maxQuantity ?? LF_ROLL_PACK_MAX_QUANTITY;
  const Q = input.quantity;
  if (!Number.isFinite(Q) || Q < 1 || !Number.isInteger(Q)) {
    return { ok: false, code: "does_not_fit" };
  }
  if (Q > maxQ) {
    return { ok: false, code: "quantity_too_large" };
  }

  const pw = input.printableWidthCm;
  const w = input.printWidthCm;
  const h = input.printHeightCm;
  if (!Number.isFinite(pw) || pw <= 0 || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { ok: false, code: "does_not_fit" };
  }

  const orientations = buildOrientations(w, h, pw);
  if (orientations.length === 0) {
    return { ok: false, code: "does_not_fit" };
  }

  const o0 = orientations[0]!;
  const o1 = orientations[1] ?? null;

  const dp = new Array<number>(Q + 1).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Array<number>(Q + 1).fill(-1);
  const rowHArr = new Array<number>(Q + 1).fill(0);
  const lastKa = new Array<number>(Q + 1).fill(0);
  const lastKb = new Array<number>(Q + 1).fill(0);

  dp[0] = 0;

  for (let i = 0; i < Q; i++) {
    if (!Number.isFinite(dp[i])) continue;

    const remaining = Q - i;
    for (let take = 1; take <= remaining; take++) {
      if (!o1) {
        if (take * o0.cross > pw + EPS) continue;
        const rh = o0.along;
        const nj = i + take;
        const next = dp[i] + rh;
        if (
          rowBetter(next, dp[nj], take, 0, lastKa[nj], lastKb[nj])
        ) {
          dp[nj] = next;
          cameFrom[nj] = i;
          rowHArr[nj] = rh;
          lastKa[nj] = take;
          lastKb[nj] = 0;
        }
      } else {
        for (let kA = 0; kA <= take; kA++) {
          const kB = take - kA;
          if (kA === 0 && kB === 0) continue;
          if (kA * o0.cross + kB * o1.cross > pw + EPS) continue;
          const rh = Math.max(kA > 0 ? o0.along : 0, kB > 0 ? o1.along : 0);
          const nj = i + take;
          const next = dp[i] + rh;
          if (rowBetter(next, dp[nj], kA, kB, lastKa[nj], lastKb[nj])) {
            dp[nj] = next;
            cameFrom[nj] = i;
            rowHArr[nj] = rh;
            lastKa[nj] = kA;
            lastKb[nj] = kB;
          }
        }
      }
    }
  }

  if (!Number.isFinite(dp[Q])) {
    return { ok: false, code: "does_not_fit" };
  }

  const totalAlongCm = dp[Q];

  type RowPack = { y: number; ka: number; kb: number; rh: number };
  const rowsRev: RowPack[] = [];
  let cur = Q;
  while (cur > 0) {
    const prev = cameFrom[cur];
    if (prev < 0) return { ok: false, code: "does_not_fit" };
    rowsRev.push({
      y: 0,
      ka: lastKa[cur]!,
      kb: lastKb[cur]!,
      rh: rowHArr[cur]!,
    });
    cur = prev;
  }
  rowsRev.reverse();

  let yCursor = 0;
  const placements: LfRollPlacement[] = [];
  for (const row of rowsRev) {
    row.y = yCursor;
    let x = 0;
    for (let i = 0; i < row.ka; i++) {
      placements.push({
        xCm: x,
        yCm: row.y,
        crossCm: o0.cross,
        alongCm: o0.along,
        rotated: o0.rotated,
      });
      x += o0.cross;
    }
    if (o1) {
      for (let i = 0; i < row.kb; i++) {
        placements.push({
          xCm: x,
          yCm: row.y,
          crossCm: o1.cross,
          alongCm: o1.along,
          rotated: o1.rotated,
        });
        x += o1.cross;
      }
    }
    yCursor += row.rh;
  }

  const layout: LargeFormatRollPackLayout = {
    algorithmVersion: LF_ROLL_PACK_ALGORITHM_VERSION,
    printableWidthCm: pw,
    nominalRollWidthMeters: input.nominalRollWidthMeters,
    calculatedLinearMeters: totalAlongCm / 100,
    totalAlongCm,
    placements,
    orientationsUsed: orientations.map((o) => ({
      crossCm: o.cross,
      alongCm: o.along,
      rotated: o.rotated,
    })),
  };

  return { ok: true, layout };
}
