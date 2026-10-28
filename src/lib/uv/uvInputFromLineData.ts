import type { UvLineInput } from "@/lib/uv/uvLineInput";
import type { UvLineData } from "@/lib/uv/types";

/** Rebuild the operator's input from a stored snapshot (re-pricing on edit, editor prefill). */
export function uvInputFromLineData(data: UvLineData | null): UvLineInput | undefined {
  if (!data) return undefined;
  return {
    source: data.source,
    variantId: data.item?.variantId,
    clientItem: data.clientItem
      ? { description: data.clientItem.description, notes: data.clientItem.notes ?? undefined }
      : undefined,
    quantity: data.quantity,
    zones: data.zones.map((z) => ({
      id: z.id,
      placement: z.placement,
      placementLabel: z.placementLabel ?? undefined,
      widthCm: z.widthCm,
      heightCm: z.heightCm,
      whiteLayers: z.whiteLayers,
      varnish: z.varnish,
      primer: z.primer === true,
    })),
  };
}
