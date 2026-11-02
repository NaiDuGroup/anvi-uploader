import type { DtfLineInput } from "@/lib/dtf/dtfLineInput";

/** Pieces of one DTF line input (all sizes). */
export function dtfInputPieces(input: Pick<DtfLineInput, "sizes">): number {
  return input.sizes.reduce((sum, s) => sum + s.quantity, 0);
}

/**
 * Run quantity of each line of an order: lines sharing a `layoutKey` carry the
 * same layout, so their pieces count together for run-size prices («Ofertă»:
 * the offer holds for one layout on all pieces). Entries are null for non-DTF
 * lines; a line without a key keeps its own count.
 */
export function dtfLayoutRunQuantities(
  inputs: readonly (Pick<DtfLineInput, "sizes" | "layoutKey"> | null | undefined)[],
): (number | null)[] {
  const byKey = new Map<string, number>();
  for (const input of inputs) {
    if (!input?.layoutKey) continue;
    byKey.set(input.layoutKey, (byKey.get(input.layoutKey) ?? 0) + dtfInputPieces(input));
  }
  return inputs.map((input) => {
    if (!input) return null;
    return input.layoutKey ? (byKey.get(input.layoutKey) ?? 0) : dtfInputPieces(input);
  });
}
