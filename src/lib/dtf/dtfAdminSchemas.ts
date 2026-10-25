import { z } from "zod";
import { dtfLineInputSchema } from "@/lib/dtf/dtfLineInput";

const money = z.number().min(0).max(999_999_999);

export const dtfPresetSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    widthCm: z.number().positive().max(200),
    heightCm: z.number().positive().max(200),
    retailPrice: money,
    dealerPrice: money.nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
  });
export type DtfPresetInput = z.infer<typeof dtfPresetSchema>;

export const dtfQuoteSchema = z.object({
  dtf: dtfLineInputSchema,
  customerType: z.enum(["retail", "dealer"]).default("retail"),
});
