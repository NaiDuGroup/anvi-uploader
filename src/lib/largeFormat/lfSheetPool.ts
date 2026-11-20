/**
 * Pooled sheet layout of a wide-format sheet material (VATMAN A1): lines of
 * several orders printed together on N whole sheets instead of their per-line
 * layouts. Pure helpers for the workshop «Подтвердить печать» confirm:
 *
 * - every line's share of the N sheets, by printed area, never more than the
 *   line's own per-line sheets (a line never costs more than printed alone);
 * - a whole-sheet stock share per line (sum = N) — what the line keeps holding
 *   on the ledger; the rest goes back to stock (`LAYOUT_POOL_RETURN`);
 * - the line's material cost re-based on its (fractional) area share.
 *
 * Order prices never change: only cost / profit and stock.
 */
import type { LargeFormatLineData } from "./types";

const EPS = 1e-9;

/** Persisted on `LargeFormatLineData.sheetPool` once the pooled print is confirmed. */
export interface LfSheetPoolRecord {
  /** Same id on every line printed in this pool. */
  poolId: string;
  /** Sheets the whole pool was printed on. */
  poolSheets: number;
  /** Per-line sheets of every pool line together (before pooling). */
  naiveSheets: number;
  /** Order numbers of the pool (sorted, unique). */
  orderNumbers: number[];
  lineCount: number;
  /** This line's per-line sheets (its own layout). */
  ownSheets: number;
  /** This line's area share of the pool (fractional sheets): material cost base. */
  shareSheets: number;
  /** Whole sheets this line keeps on the ledger (pool lines sum up to `poolSheets`). */
  stockSheets: number;
  /** Cost fields before the pool, to show / undo. */
  ownMaterialCostMdl: number;
  confirmedAt: string;
  confirmedById: string | null;
}

export interface LfSheetPoolLineInput {
  id: string;
  /** Per-line whole sheets (its own layout). */
  ownSheets: number;
  /** Printed area of the line (pieces × piece area), any unit. */
  area: number;
}

export interface LfSheetPoolLineShare {
  id: string;
  ownSheets: number;
  shareSheets: number;
  stockSheets: number;
}

export type LfSheetPoolPlan =
  | { ok: true; naiveSheets: number; savedSheets: number; lines: LfSheetPoolLineShare[] }
  | { ok: false; code: "no_lines" | "invalid_sheets" | "no_saving" };

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Split `poolSheets` over the lines: area-proportional shares capped at each
 * line's own sheets (water filling), then whole sheets by largest remainder
 * (also capped). Fails when pooling saves nothing (N ≥ Σ own sheets).
 */
export function planLfSheetPool(lines: readonly LfSheetPoolLineInput[], poolSheets: number): LfSheetPoolPlan {
  if (lines.length === 0) return { ok: false, code: "no_lines" };
  if (!Number.isInteger(poolSheets) || poolSheets < 1) return { ok: false, code: "invalid_sheets" };
  const own = lines.map((l) => (Number.isFinite(l.ownSheets) && l.ownSheets > 0 ? Math.ceil(l.ownSheets) : 0));
  const naiveSheets = own.reduce((s, n) => s + n, 0);
  if (poolSheets >= naiveSheets) return { ok: false, code: "no_saving" };

  // Fractional shares: water filling by area, capped at own sheets.
  const area = lines.map((l, i) => (own[i]! > 0 ? Math.max(0, Number.isFinite(l.area) ? l.area : 0) : 0));
  const share: number[] = lines.map(() => 0);
  const open = new Set<number>(own.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0));
  let left = poolSheets;
  while (left > EPS && open.size > 0) {
    let areaSum = 0;
    for (const i of open) areaSum += area[i]!;
    const weight = (i: number): number => (areaSum > EPS ? area[i]! / areaSum : 1 / open.size);
    // Lines whose proportional share would exceed their own sheets are capped first.
    const capped = [...open].filter((i) => share[i]! + left * weight(i) > own[i]! + EPS);
    if (capped.length === 0) {
      for (const i of open) share[i] = share[i]! + left * weight(i);
      left = 0;
      break;
    }
    for (const i of capped) {
      left -= own[i]! - share[i]!;
      share[i] = own[i]!;
      open.delete(i);
    }
  }

  // Whole sheets: floor, then the largest remainders (never above own sheets).
  const stock: number[] = share.map((s, i) => Math.min(Math.floor(s + EPS), own[i]!));
  let rest = poolSheets - stock.reduce((s, n) => s + n, 0);
  const order = lines
    .map((_, i) => i)
    .sort((a, b) => share[b]! - stock[b]! - (share[a]! - stock[a]!) || area[b]! - area[a]! || a - b);
  while (rest > 0) {
    let progressed = false;
    for (const i of order) {
      if (rest <= 0) break;
      if (stock[i]! < own[i]!) {
        stock[i] = stock[i]! + 1;
        rest--;
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  return {
    ok: true,
    naiveSheets,
    savedSheets: naiveSheets - poolSheets,
    lines: lines.map((l, i) => ({
      id: l.id,
      ownSheets: own[i]!,
      shareSheets: round4(share[i]!),
      stockSheets: stock[i]!,
    })),
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Line data with the pool recorded and its material cost re-based on the
 * area share (cost per sheet = order-time material cost ÷ own sheets).
 * Sell prices stay untouched; profit / margin follow the new cost.
 */
export function applyLfSheetPoolToLineData(
  data: LargeFormatLineData,
  record: Omit<LfSheetPoolRecord, "ownMaterialCostMdl">,
): LargeFormatLineData {
  const ownCost: number = data.sheetPool?.ownMaterialCostMdl ?? data.materialCost;
  const costPerSheet: number = record.ownSheets > 0 ? ownCost / record.ownSheets : 0;
  const newCost: number = roundMoney(record.shareSheets * costPerSheet);
  const delta: number = roundMoney(newCost - data.materialCost);
  const next: LargeFormatLineData = {
    ...data,
    materialCost: newCost,
    estimatedProfit: roundMoney(data.estimatedProfit - delta),
    sheetPool: { ...record, ownMaterialCostMdl: ownCost },
  };
  if (typeof data.materialPurchaseCostMdl === "number") {
    next.materialPurchaseCostMdl = roundMoney(data.materialPurchaseCostMdl + delta);
  }
  if (typeof data.totalDirectCostMdl === "number") {
    next.totalDirectCostMdl = roundMoney(data.totalDirectCostMdl + delta);
    if (typeof data.marginPercent === "number" && data.totalSellPrice > 0) {
      next.marginPercent =
        Math.round(((data.totalSellPrice - next.totalDirectCostMdl) / data.totalSellPrice) * 10_000) / 100;
    }
  }
  if (typeof data.writtenOffAreaSqm === "number" && record.ownSheets > 0) {
    next.writtenOffAreaSqm = round4((data.writtenOffAreaSqm / record.ownSheets) * record.shareSheets);
    if (typeof data.usefulAreaSqm === "number" && next.writtenOffAreaSqm > 0) {
      next.materialEfficiencyPct = Math.round((data.usefulAreaSqm / next.writtenOffAreaSqm) * 10_000) / 100;
    }
  }
  return next;
}
