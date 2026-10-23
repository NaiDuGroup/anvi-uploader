import { z } from "zod";
import {
  DTF_GARMENT_SOURCES,
  DTF_MAX_PIECES,
  DTF_MAX_SIZES,
  DTF_MAX_ZONES,
  DTF_PLACEMENTS,
} from "@/lib/dtf/dtfConstants";

export const dtfZoneInputSchema = z.object({
  id: z.string().min(1).max(40),
  placement: z.enum(DTF_PLACEMENTS),
  /** Price list entry; null with explicit size for custom transfers. */
  presetId: z.string().uuid().nullable(),
  widthCm: z.number().positive().max(200).optional(),
  heightCm: z.number().positive().max(200).optional(),
});

export const dtfSizeInputSchema = z.object({
  size: z.string().trim().min(1).max(16),
  quantity: z.number().int().min(1).max(DTF_MAX_PIECES),
});

/** What the operator submits for a DTF line; prices are computed server-side. */
export const dtfLineInputSchema = z
  .object({
    garmentSource: z.enum(DTF_GARMENT_SOURCES),
    garmentProductId: z.string().uuid().optional(),
    sizes: z.array(dtfSizeInputSchema).min(1).max(DTF_MAX_SIZES),
    zones: z.array(dtfZoneInputSchema).min(1).max(DTF_MAX_ZONES),
  })
  .superRefine((data, ctx) => {
    if (data.garmentSource === "stock" && !data.garmentProductId) {
      ctx.addIssue({ code: "custom", message: "dtf_garment_required", path: ["garmentProductId"] });
    }
    const total: number = data.sizes.reduce((sum, s) => sum + s.quantity, 0);
    if (total > DTF_MAX_PIECES) {
      ctx.addIssue({ code: "custom", message: "dtf_quantity_max", path: ["sizes"] });
    }
    const sizeKeys = new Set(data.sizes.map((s) => s.size.toUpperCase()));
    if (sizeKeys.size !== data.sizes.length) {
      ctx.addIssue({ code: "custom", message: "dtf_size_duplicate", path: ["sizes"] });
    }
    const zoneIds = new Set(data.zones.map((z) => z.id));
    if (zoneIds.size !== data.zones.length) {
      ctx.addIssue({ code: "custom", message: "dtf_zone_duplicate", path: ["zones"] });
    }
    data.zones.forEach((zone, i) => {
      if (zone.presetId == null && (zone.widthCm == null || zone.heightCm == null)) {
        ctx.addIssue({ code: "custom", message: "dtf_zone_size_required", path: ["zones", i] });
      }
    });
  });

export type DtfLineInput = z.infer<typeof dtfLineInputSchema>;
export type DtfZoneInput = z.infer<typeof dtfZoneInputSchema>;
