import { sublimationLineSource } from "@/lib/sublimation/parseSublimationLineData";
import type { SublimationLineInput } from "@/lib/sublimation/sublimationLineInput";
import type { SublimationLineData } from "@/lib/sublimation/types";

/** Rebuild the operator's input from a stored snapshot (re-pricing on edit, editor prefill). */
export function sublimationInputFromLineData(data: SublimationLineData | null): SublimationLineInput | undefined {
  if (!data) return undefined;
  if (sublimationLineSource(data) === "client") {
    const c = data.clientItem;
    if (!c) return undefined;
    return {
      source: "client",
      clientItem: { description: c.description, notes: c.notes ?? undefined, widthCm: c.widthCm, heightCm: c.heightCm },
      quantity: data.quantity,
    };
  }
  if (!data.item) return undefined;
  return { source: "stock", variantId: data.item.variantId, quantity: data.quantity };
}
