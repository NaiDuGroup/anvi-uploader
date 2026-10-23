import type { DtfLineInput } from "@/lib/dtf/dtfLineInput";
import type { DtfLineData } from "@/lib/dtf/types";

/** Rebuild the operator's input from a stored snapshot (re-pricing on edit, editor prefill). */
export function dtfInputFromLineData(data: DtfLineData | null): DtfLineInput | undefined {
  if (!data) return undefined;
  return {
    garmentSource: data.garmentSource,
    garmentProductId: data.garment?.garmentProductId,
    sizes: data.sizes.map((s) => ({ size: s.size, quantity: s.quantity })),
    zones: data.zones.map((z) => ({
      id: z.id,
      placement: z.placement,
      presetId: z.customSize ? null : z.presetId,
      widthCm: z.customSize ? z.widthCm : undefined,
      heightCm: z.customSize ? z.heightCm : undefined,
    })),
  };
}
