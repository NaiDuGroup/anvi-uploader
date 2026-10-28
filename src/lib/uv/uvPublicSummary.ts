import { parseUvLineData } from "./parseUvLineData";
import type { UvLineData } from "./types";

/** Customer-safe view of a UV line: what is printed on what, without costs or margins. */
export type UvPublicSummary = {
  source: UvLineData["source"];
  item: Pick<NonNullable<UvLineData["item"]>, "name" | "names" | "variantLabel"> | null;
  clientItemDescription: string | null;
  quantity: number;
  zones: {
    placement: UvLineData["zones"][number]["placement"];
    placementLabel: string | null;
    /** «14.5×21 см». */
    sizeLabel: string;
    whiteLayers: number;
    varnish: boolean;
    primer: boolean;
  }[];
};

/** Print size of a zone, «14.5×21 см». */
export function uvZoneSizeLabel(z: Pick<UvLineData["zones"][number], "widthCm" | "heightCm">): string {
  return `${z.widthCm}×${z.heightCm} см`;
}

export function toUvPublicSummary(raw: unknown): UvPublicSummary | null {
  const data: UvLineData | null = parseUvLineData(raw);
  if (!data) return null;
  return {
    source: data.source,
    item: data.item ? { name: data.item.name, names: data.item.names, variantLabel: data.item.variantLabel } : null,
    clientItemDescription: data.clientItem?.description ?? null,
    quantity: data.quantity,
    zones: data.zones.map((z) => ({
      placement: z.placement,
      placementLabel: z.placementLabel,
      sizeLabel: uvZoneSizeLabel(z),
      whiteLayers: z.whiteLayers,
      varnish: z.varnish,
      primer: z.primer === true,
    })),
  };
}
