import { z } from "zod";
import { dtfLineInputSchema } from "@/lib/dtf/dtfLineInput";

export const dtfQuoteSchema = z.object({
  dtf: dtfLineInputSchema,
  customerType: z.enum(["retail", "dealer"]).default("retail"),
});
