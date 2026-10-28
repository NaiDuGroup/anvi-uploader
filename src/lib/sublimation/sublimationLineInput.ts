import { z } from "zod";
import {
  SUBLIMATION_ITEM_SOURCES,
  SUBLIMATION_MAX_DESCRIPTION,
  SUBLIMATION_MAX_NOTES,
  SUBLIMATION_MAX_PIECES,
  SUBLIMATION_MAX_SIZE_CM,
} from "@/lib/sublimation/sublimationConstants";

/** The client's own item: what it is and the print size on it. */
export const sublimationClientItemInputSchema = z.object({
  description: z.string().trim().min(1).max(SUBLIMATION_MAX_DESCRIPTION),
  notes: z.string().trim().max(SUBLIMATION_MAX_NOTES).optional(),
  widthCm: z.number().positive().max(SUBLIMATION_MAX_SIZE_CM),
  heightCm: z.number().positive().max(SUBLIMATION_MAX_SIZE_CM),
});

/** What the operator submits for a sublimation line; prices are computed server-side. */
export const sublimationLineInputSchema = z
  .object({
    /** Absent = «stock» (inputs before client items existed). */
    source: z.enum(SUBLIMATION_ITEM_SOURCES).optional(),
    /** `StockVariant.id` of the blank (stock source). */
    variantId: z.string().uuid().optional(),
    /** Client source. */
    clientItem: sublimationClientItemInputSchema.optional(),
    quantity: z.number().int().min(1).max(SUBLIMATION_MAX_PIECES),
  })
  .superRefine((data, ctx) => {
    if (data.source !== "client" && !data.variantId) {
      ctx.addIssue({ code: "custom", message: "subl_item_required", path: ["variantId"] });
    }
    if (data.source === "client" && !data.clientItem) {
      ctx.addIssue({ code: "custom", message: "subl_client_item_required", path: ["clientItem"] });
    }
  });

/** `source` may be omitted (= «stock»), so inputs from before client items keep parsing. */
export type SublimationLineInput = z.infer<typeof sublimationLineInputSchema>;
