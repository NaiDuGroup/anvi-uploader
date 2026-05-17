/** Same epsilon as [`buildOrientations`](./largeFormatRollPack.ts): piece fits if laid across roll with rotation. */
const EPS = 1e-6;

/**
 * True iff the rectangular print fits **across** the printable width of the roll
 * when rotation is allowed (`cross` dimension is width or height).
 */
export function lfPieceFitsAcrossPrintableWidthCm(
  printWidthCm: number,
  printHeightCm: number,
  printableWidthCm: number,
): boolean {
  if (
    !(Number.isFinite(printableWidthCm) && printableWidthCm > EPS) ||
    !(Number.isFinite(printWidthCm) && printWidthCm > 0) ||
    !(Number.isFinite(printHeightCm) && printHeightCm > 0)
  ) {
    return false;
  }
  const pw = printableWidthCm;
  return printWidthCm <= pw + EPS || printHeightCm <= pw + EPS;
}
