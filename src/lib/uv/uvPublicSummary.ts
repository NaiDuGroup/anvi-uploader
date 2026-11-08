import { parseOrderLineSetData } from "@/lib/giftSet/giftSet";
import { parseUvLineData } from "./parseUvLineData";
import type { UvLineData } from "./types";

/** Customer-safe view of a UV line: what is printed on what, without costs or margins. */
export type UvPublicSummary = {
  source: UvLineData["source"];
  item: Pick<NonNullable<UvLineData["item"]>, "name" | "names" | "variantLabel" | "colorHex"> | null;
  clientItemDescription: string | null;
  /** «Набор» C: the item is the set's («Термос из набора · чёрный»), not the client's. */
  giftSetItem?: boolean;
  /** Staff notes on the client's item; production views only. */
  clientItemNotes?: string | null;
  /** Real size of the client's item, «33.8×26.2 см» (the zones are the print size inside it). */
  clientItemSizeLabel?: string | null;
  /** Photo of the client's item (the customer's own upload, so shown in the cabinet too). */
  clientItemPhoto?: { fileUrl: string; fileName: string } | null;
  quantity: number;
  zones: {
    placement: UvLineData["zones"][number]["placement"];
    placementLabel: string | null;
    /** «14.5×21 см». */
    sizeLabel: string;
    /** White underbase layers; production views only. */
    whiteLayers?: number;
    /** Varnish is a finish the customer chose, so it is always shown. */
    varnish: boolean;
    /** Hand priming; production views only. */
    primer?: boolean;
  }[];
};

/** Print size of a zone, «14.5×21 см». */
export function uvZoneSizeLabel(z: Pick<UvLineData["zones"][number], "widthCm" | "heightCm">): string {
  return `${z.widthCm}×${z.heightCm} см`;
}

/**
 * Customer-safe by default; `production: true` (staff views) adds the white underbase / primer
 * settings and the staff notes on a client item.
 */
export function toUvPublicSummary(
  raw: unknown,
  opts: { production?: boolean; setData?: unknown } = {},
): UvPublicSummary | null {
  const data: UvLineData | null = parseUvLineData(raw);
  if (!data) return null;
  const production: boolean = opts.production === true;
  const set = opts.setData != null ? parseOrderLineSetData(opts.setData) : null;
  return {
    source: data.source,
    item: data.item
      ? {
          name: data.item.name,
          names: data.item.names,
          variantLabel: data.item.variantLabel,
          colorHex: data.item.colorHex ?? null,
        }
      : null,
    clientItemDescription: data.clientItem?.description ?? null,
    ...(set?.kind === "ready" && set.zoneId && data.source === "client" ? { giftSetItem: true } : {}),
    ...(production ? { clientItemNotes: data.clientItem?.notes ?? null } : {}),
    ...(data.clientItem?.itemWidthCm != null && data.clientItem.itemHeightCm != null
      ? {
          clientItemSizeLabel: uvZoneSizeLabel({
            widthCm: data.clientItem.itemWidthCm,
            heightCm: data.clientItem.itemHeightCm,
          }),
        }
      : {}),
    ...(data.clientItem?.photo
      ? { clientItemPhoto: { fileUrl: data.clientItem.photo.fileUrl, fileName: data.clientItem.photo.fileName } }
      : {}),
    quantity: data.quantity,
    zones: data.zones.map((z) => ({
      placement: z.placement,
      placementLabel: z.placementLabel,
      sizeLabel: uvZoneSizeLabel(z),
      ...(production ? { whiteLayers: z.whiteLayers } : {}),
      varnish: z.varnish,
      ...(production ? { primer: z.primer === true } : {}),
    })),
  };
}
