import { z } from "zod";
import { SUBLIMATION_MAX_PIECES } from "@/lib/sublimation/sublimationConstants";

/** What the operator submits for a sublimation line; prices are computed server-side. */
export const sublimationLineInputSchema = z.object({
  /** `StockVariant.id` of the blank. */
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(SUBLIMATION_MAX_PIECES),
});

export type SublimationLineInput = z.infer<typeof sublimationLineInputSchema>;
