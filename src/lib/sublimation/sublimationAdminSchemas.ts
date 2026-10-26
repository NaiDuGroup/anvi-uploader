import { z } from "zod";
import { sublimationLineInputSchema } from "@/lib/sublimation/sublimationLineInput";

export const sublimationQuoteSchema = z.object({
  sublimation: sublimationLineInputSchema,
  customerType: z.enum(["retail", "dealer"]).default("retail"),
});
