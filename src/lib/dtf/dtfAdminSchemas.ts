import { z } from "zod";
import { DTF_CONSUMABLES, GARMENT_KINDS } from "@/lib/dtf/dtfConstants";
import { dtfLineInputSchema } from "@/lib/dtf/dtfLineInput";
import { garmentPriceTiersSchema } from "@/lib/dtf/garmentPriceTiers";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "invalid_hex");
const sizeName = z.string().trim().min(1).max(16);
const money = z.number().min(0).max(999_999_999);

const garmentSizesSchema = z
  .array(sizeName)
  .min(1)
  .max(20)
  .refine((sizes) => new Set(sizes.map((s) => s.toUpperCase())).size === sizes.length, {
    message: "dtf_size_duplicate",
  });

export const createGarmentSchema = z.object({
  kind: z.enum(GARMENT_KINDS),
  name: z.string().trim().min(1).max(120),
  colorName: z.string().trim().min(1).max(60),
  colorHex: hexColor.nullable().optional(),
  purchaseCost: money.nullable().optional(),
  priceTiers: garmentPriceTiersSchema,
  sizes: garmentSizesSchema,
  internalNotes: z.string().max(2000).nullable().optional(),
});
export type CreateGarmentInput = z.infer<typeof createGarmentSchema>;

export const updateGarmentSchema = createGarmentSchema.partial().extend({
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});
export type UpdateGarmentInput = z.infer<typeof updateGarmentSchema>;

const receiptHeader = {
  purchasedAt: z.coerce.date(),
  supplier: z.string().max(500).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
};

export const garmentReceiptSchema = z.object({
  ...receiptHeader,
  lines: z
    .array(
      z.object({
        garmentVariantId: z.string().uuid(),
        quantity: z.number().int().min(1).max(1_000_000),
        totalCostMdl: money,
      }),
    )
    .min(1)
    .max(200),
});
export type GarmentReceiptInput = z.infer<typeof garmentReceiptSchema>;

export const dtfConsumableReceiptSchema = z.object({
  ...receiptHeader,
  consumable: z.enum(DTF_CONSUMABLES as [string, ...string[]]),
  quantity: z.number().positive().max(1_000_000_000),
  totalCostMdl: money,
});
export type DtfConsumableReceiptInput = z.infer<typeof dtfConsumableReceiptSchema>;

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
