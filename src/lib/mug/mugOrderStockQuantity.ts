/** Total mug pieces for stock: sum of file copies; if sum is 0, treat as 1. */
export function mugOrderStockQuantityFromFiles(
  files: readonly { copies: number }[],
): number {
  const sum = files.reduce((acc, f) => acc + Math.max(0, f.copies ?? 0), 0);
  return sum > 0 ? sum : 1;
}
