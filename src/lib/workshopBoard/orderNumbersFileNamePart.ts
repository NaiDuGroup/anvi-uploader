/**
 * File-name fragment listing the order numbers inside a generated layout, so
 * the operator sees which orders a PDF holds without opening it:
 * `[2470, 2468, 2469, 2468]` → `2468_2469_2470`.
 *
 * Unique, ascending, `_`-separated. Past `max` numbers the tail collapses to
 * `+N` to keep the name well under OS limits.
 */
export const ORDER_NUMBERS_FILE_NAME_MAX = 20;

export function orderNumbersFileNamePart(
  orderNumbers: readonly (number | null | undefined)[],
  max: number = ORDER_NUMBERS_FILE_NAME_MAX,
): string {
  const unique = [
    ...new Set(
      orderNumbers.filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n),
      ),
    ),
  ].sort((a, b) => a - b);
  if (unique.length <= max) return unique.join("_");
  return `${unique.slice(0, max).join("_")}_+${unique.length - max}`;
}
