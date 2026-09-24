/** 
 * Total pen pieces for stock: sum of file copies; min 1 (never 0).
 * Enforces copies >= 1 validation on input forms.
 */
export function penOrderStockQuantityFromFiles(
  files: readonly { copies: number }[],
): number {
  const sum = files.reduce((acc, f) => acc + Math.max(1, f.copies ?? 1), 0);
  return Math.max(1, sum);
}
