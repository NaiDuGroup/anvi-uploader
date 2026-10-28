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
  UV_PLACEMENTS,
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

export const uvClientItemInputSchema = z.object({
  description: z.string().trim().min(1).max(UV_MAX_DESCRIPTION),
  notes: z.string().trim().max(UV_MAX_NOTES).optional(),
});

/** What the operator submits for a UV line; prices are computed server-side. */
export const uvLineInputSchema = z
  .object({
    source: z.enum(UV_ITEM_SOURCES),
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
    if (data.source === "client" && !data.clientItem) {
      ctx.addIssue({ code: "custom", message: "uv_client_item_required", path: ["clientItem"] });
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
      if (zone.placement === "other" && !zone.placementLabel) {
        ctx.addIssue({ code: "custom", message: "uv_placement_label_required", path: ["zones", i, "placementLabel"] });
      }
    });
  });

export type UvLineInput = z.infer<typeof uvLineInputSchema>;
export type UvZoneInput = z.infer<typeof uvZoneInputSchema>;
