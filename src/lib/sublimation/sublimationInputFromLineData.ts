import type { SublimationLineInput } from "@/lib/sublimation/sublimationLineInput";
import type { SublimationLineData } from "@/lib/sublimation/types";

/** Rebuild the operator's input from a stored snapshot (re-pricing on edit, editor prefill). */
export function sublimationInputFromLineData(data: SublimationLineData | null): SublimationLineInput | undefined {
  if (!data) return undefined;
  return { variantId: data.item.variantId, quantity: data.quantity };
}
