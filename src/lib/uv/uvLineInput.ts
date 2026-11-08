import { z } from "zod";
import {
  UV_DEFAULT_WHITE_LAYERS,
  UV_ITEM_SOURCES,
  UV_MAX_DESCRIPTION,
  UV_MAX_NOTES,
  UV_MAX_PIECES,
  UV_MAX_PLACEMENT_LABEL,
  UV_MAX_WHITE_LAYERS,
  UV_MAX_ZONES,
  UV_AS_IS_PLACEMENT,
  UV_PLACEMENTS,
  UV_TECHNIQUES,
} from "@/lib/uv/uvConstants";

export const uvZoneInputSchema = z.object({
  id: z.string().min(1).max(40),
  placement: z.enum(UV_PLACEMENTS),
  /** Free-text place on the item; required for «other». */
  placementLabel: z.string().trim().max(UV_MAX_PLACEMENT_LABEL).optional(),
  /** Print size in cm; the main zone of a stock item with print parameters takes the item's size. */
  widthCm: z.number().positive().max(200).optional(),
  heightCm: z.number().positive().max(200).optional(),
  whiteLayers: z.number().int().min(0).max(UV_MAX_WHITE_LAYERS).default(UV_DEFAULT_WHITE_LAYERS),
  varnish: z.boolean().default(false),
  /** Primed by hand before printing (taken from stock, surcharge %). */
  primer: z.boolean().default(false),
});

/** R2 key of an order upload (`uploads/…`): the item photo is never a link or a library / catalog key. */
export function isUvItemPhotoKey(value: string): boolean {
  return (
    value.startsWith("uploads/") &&
    value.length > "uploads/".length &&
    !value.includes("..") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export const uvItemPhotoInputSchema = z.object({
  fileUrl: z.string().max(1024).refine(isUvItemPhotoKey, "uv_item_photo_invalid"),
  fileName: z.string().trim().min(1).max(255),
});

export const uvClientItemInputSchema = z.object({
  description: z.string().trim().min(1).max(UV_MAX_DESCRIPTION),
  notes: z.string().trim().max(UV_MAX_NOTES).optional(),
  /** Real size of the item (cm); the zones are the print size inside it. */
  itemWidthCm: z.number().positive().max(500).optional(),
  itemHeightCm: z.number().positive().max(500).optional(),
  /** Photo of the actual item / material (required for dealers, see `uvDealerClientItemIssue`). */
  photo: uvItemPhotoInputSchema.optional(),
});

/** Small slack for typed sizes (mm rounding): a print 0.05 cm over the item still fits. */
const FIT_SLACK_CM = 0.05;

/**
 * Does a print of `print` fit on an item of `item` (cm)? Either orientation:
 * the print may be turned 90° on the item.
 */
export function uvPrintFitsItem(
  print: { widthCm: number; heightCm: number },
  item: { widthCm: number; heightCm: number },
): boolean {
  const fits = (w: number, h: number): boolean =>
    w <= item.widthCm + FIT_SLACK_CM && h <= item.heightCm + FIT_SLACK_CM;
  return fits(print.widthCm, print.heightCm) || fits(print.heightCm, print.widthCm);
}

/** First zone of a client item that does not fit its declared item size (null when all fit or no size). */
export function uvZoneLargerThanItem(
  clientItem: { itemWidthCm?: number | null; itemHeightCm?: number | null } | null | undefined,
  zones: readonly { widthCm?: number | null; heightCm?: number | null }[],
): number | null {
  const w = clientItem?.itemWidthCm;
  const h = clientItem?.itemHeightCm;
  if (!(w != null && w > 0 && h != null && h > 0)) return null;
  const index = zones.findIndex(
    (z) =>
      z.widthCm != null &&
      z.heightCm != null &&
      z.widthCm > 0 &&
      z.heightCm > 0 &&
      !uvPrintFitsItem({ widthCm: z.widthCm, heightCm: z.heightCm }, { widthCm: w, heightCm: h }),
  );
  return index >= 0 ? index : null;
}

/** What the operator submits for a UV line; prices are computed server-side. */
export const uvLineInputSchema = z
  .object({
    source: z.enum(UV_ITEM_SOURCES),
    /** Direct UV print or UV-DTF (film); stickers are always UV-DTF. */
    technique: z.enum(UV_TECHNIQUES).optional(),
    /** `StockVariant.id` of the stock item. */
    variantId: z.string().uuid().optional(),
    clientItem: uvClientItemInputSchema.optional(),
    quantity: z.number().int().min(1).max(UV_MAX_PIECES),
    zones: z.array(uvZoneInputSchema).min(1).max(UV_MAX_ZONES),
  })
  .superRefine((data, ctx) => {
    if (data.source === "stock" && !data.variantId) {
      ctx.addIssue({ code: "custom", message: "uv_item_required", path: ["variantId"] });
    }
    if (data.source === "stickers" && data.technique !== "transfer") {
      ctx.addIssue({ code: "custom", message: "uv_stickers_need_transfer", path: ["technique"] });
    }
    if (data.source === "client" && !data.clientItem) {
      ctx.addIssue({ code: "custom", message: "uv_client_item_required", path: ["clientItem"] });
    }
    if (data.source === "client" && data.clientItem) {
      const { itemWidthCm, itemHeightCm } = data.clientItem;
      if ((itemWidthCm == null) !== (itemHeightCm == null)) {
        ctx.addIssue({ code: "custom", message: "uv_item_size_required", path: ["clientItem"] });
      }
      const tooBig = uvZoneLargerThanItem(data.clientItem, data.zones);
      if (tooBig != null) {
        ctx.addIssue({ code: "custom", message: "uv_print_larger_than_item", path: ["zones", tooBig] });
      }
    }
    const zoneIds = new Set(data.zones.map((z) => z.id));
    if (zoneIds.size !== data.zones.length) {
      ctx.addIssue({ code: "custom", message: "uv_zone_duplicate", path: ["zones"] });
    }
    data.zones.forEach((zone, i) => {
      const sizeFromItem: boolean = data.source === "stock" && i === 0;
      if (!sizeFromItem && (zone.widthCm == null || zone.heightCm == null)) {
        ctx.addIssue({ code: "custom", message: "uv_zone_size_required", path: ["zones", i] });
      }
      if (zone.placement === UV_AS_IS_PLACEMENT && data.source !== "stickers" && data.technique !== "transfer") {
        ctx.addIssue({ code: "custom", message: "uv_as_is_needs_transfer", path: ["zones", i, "placement"] });
      }
      if (zone.placement === "other" && !zone.placementLabel) {
        ctx.addIssue({ code: "custom", message: "uv_placement_label_required", path: ["zones", i, "placementLabel"] });
      }
    });
  });

export type UvLineInput = z.infer<typeof uvLineInputSchema>;
export type UvZoneInput = z.infer<typeof uvZoneInputSchema>;
