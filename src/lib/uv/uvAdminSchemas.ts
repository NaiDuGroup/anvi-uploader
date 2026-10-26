import { z } from "zod";
import { uvLineInputSchema } from "@/lib/uv/uvLineInput";

export const uvQuoteSchema = z.object({
  uv: uvLineInputSchema,
  customerType: z.enum(["retail", "dealer"]).default("retail"),
});
