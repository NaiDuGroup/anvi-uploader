import type { ProductType } from "@/lib/validations";

/**
 * Top-level `Order.productType`: single shared type when all lines match;
 * `mixed` when the order combines different product families (paper vs mug vs notebook).
 */
export function computeOrderProductTypeFromLines(
  lines: readonly { productType: ProductType }[],
): ProductType | "mixed" {
  if (lines.length === 0) {
    return "paper_print";
  }
  const first = lines[0]!.productType;
  if (lines.length === 1) {
    return first;
  }
  const set = new Set(lines.map((l) => l.productType));
  if (set.size === 1) {
    return first;
  }
  return "mixed";
}
