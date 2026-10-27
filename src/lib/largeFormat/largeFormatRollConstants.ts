/** Sum trim (meters) subtracted from nominal roll width when `printableWidthMeters` is unset. */
export const LF_ROLL_WIDTH_DEFAULT_TRIM_M = 0.05;

/** Maximum identical rectangles considered by strip DP (server + UI). */
export const LF_ROLL_PACK_MAX_QUANTITY = 500;

/**
 * 1 = pieces packed edge to edge.
 * 3 = cutting gap between pieces and per row (see LF_ROLL_PACK_DEFAULT_GAP_CM).
 * (2 is the cross-line group packer.)
 */
export const LF_ROLL_PACK_ALGORITHM_VERSION = 3;

/**
 * Cutting gap for single-line roll layouts, matching the 1 cm the group packer
 * (`GROUP_TILE_PACK_DEFAULT_GAP_CM`) and the workshop layout use.
 */
export const LF_ROLL_PACK_DEFAULT_GAP_CM = 1;

export function resolveEffectivePrintableWidthMeters(opts: {
  printableWidthMeters: string | null | undefined;
  rollWidthMeters: string | number;
}): number {
  const trimmed =
    opts.printableWidthMeters != null ? String(opts.printableWidthMeters).trim() : "";
  if (trimmed !== "") {
    const v = Number(trimmed);
    if (Number.isFinite(v) && v > 0) return v;
  }
  const roll = Number(opts.rollWidthMeters);
  if (!Number.isFinite(roll) || roll <= 0) return 0;
  return Math.max(0, roll - LF_ROLL_WIDTH_DEFAULT_TRIM_M);
}
