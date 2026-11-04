import { DTF_ONE_SIZE } from "@/lib/dtf/stockGarments";

/** True for the size of a one-size item (cap, bag, toy): «—» or empty. */
export function isDtfOneSize(size: string | null | undefined): boolean {
  const s: string = (size ?? "").trim();
  return s === "" || s === DTF_ONE_SIZE;
}

/**
 * Staff text of a DTF line's sizes: «M×2  L×1»; a one-size item shows its
 * pieces («1 шт.») instead of «—×1».
 */
export function dtfSizesText(
  sizes: readonly { size: string; quantity: number }[],
  pieces: (count: number) => string,
): string {
  return sizes
    .filter((s) => s.quantity > 0)
    .map((s) => (isDtfOneSize(s.size) ? pieces(s.quantity) : `${s.size}×${s.quantity}`))
    .join("  ");
}
