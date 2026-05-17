/** Sum trim (meters) subtracted from nominal roll width when `printableWidthMeters` is unset. */
export const LF_ROLL_WIDTH_DEFAULT_TRIM_M = 0.05;

/** Maximum identical rectangles considered by strip DP (server + UI). */
export const LF_ROLL_PACK_MAX_QUANTITY = 500;

export const LF_ROLL_PACK_ALGORITHM_VERSION = 1;

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
