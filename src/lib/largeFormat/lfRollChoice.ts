import {
  packGroupTiles,
  type GroupTilePackTile,
} from "@/lib/largeFormat/groupTilePack";

/**
 * Cheapest-roll picker for a workshop layout.
 *
 * Given the tiles of a layout and the candidate rolls of one material family
 * (e.g. ORACAL MATT on 1.27 m and 1.62 m rolls), packs the same tiles on every
 * roll and prices the consumed length at the roll's material COGS. The wider
 * roll costs more per linear meter but often fits an extra column, so the
 * winner genuinely depends on the tile set — hence a per-layout evaluation
 * instead of a fixed preference.
 */

export interface LfRollOption {
  materialId: string;
  name: string;
  /** Usable print strip across the roll (cm). */
  printableWidthCm: number;
  /** Nominal physical roll width (m); used for preview geometry only. */
  rollWidthMeters: number;
  /** Material COGS per linear meter (MDL). */
  costPerLinearMeterMdl: number;
  /** Current stock balance (linear meters). */
  stockLinearMeters: number;
}

export interface LfRollEvaluation {
  option: LfRollOption;
  /** True when every tile was placed within the roll's printable width. */
  fits: boolean;
  unplacedTileIds: string[];
  totalAlongCm: number;
  linearMeters: number;
  /** `linearMeters × costPerLinearMeterMdl`, rounded to whole MDL. */
  costMdl: number;
  enoughStock: boolean;
}

export interface LfRollChoice {
  /** All candidates: fitting ones first, then by cost ascending. */
  evaluations: LfRollEvaluation[];
  /** Cheapest candidate that fits every tile, or null when none fits. */
  best: LfRollEvaluation | null;
}

const STOCK_EPSILON_LM = 1e-6;

export function evaluateLfRollOptions(
  tiles: readonly GroupTilePackTile[],
  options: readonly LfRollOption[],
  gapCm: number,
): LfRollChoice {
  const evaluations = options.map((option): LfRollEvaluation => {
    const pack = packGroupTiles(tiles, option.printableWidthCm, gapCm);
    const linearMeters = pack.totalAlongCm / 100;
    return {
      option,
      fits: pack.unplacedTileIds.length === 0,
      unplacedTileIds: pack.unplacedTileIds,
      totalAlongCm: pack.totalAlongCm,
      linearMeters,
      costMdl: Math.round(linearMeters * option.costPerLinearMeterMdl),
      enoughStock: option.stockLinearMeters + STOCK_EPSILON_LM >= linearMeters,
    };
  });

  evaluations.sort((a, b) => {
    if (a.fits !== b.fits) return a.fits ? -1 : 1;
    if (a.costMdl !== b.costMdl) return a.costMdl - b.costMdl;
    // Tie: prefer the narrower roll — less width written off for the same cost.
    return a.option.printableWidthCm - b.option.printableWidthCm;
  });

  const best = evaluations.find((e) => e.fits) ?? null;
  return { evaluations, best };
}
