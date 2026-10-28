import { z } from "zod";
import { garmentPriceTiersSchema } from "@/lib/dtf/garmentPriceTiers";
import { mdlPriceSchema } from "@/lib/validations";
import { STOCK_CATEGORY_KINDS, STOCK_UNITS, type StockCategoryKind, type StockUnit } from "./kinds";
import { printMethodsSchema } from "./printMethods";
import { MAX_STOCK_QUANTITY } from "./quantity";
import { duplicateSkus } from "./variantGrid";

/** Request bodies of `/api/admin/stock/**`. Unit-specific quantity checks happen in the route once the category is known. */

export const stockSkuSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, "sku_invalid_chars");

export const stockCategoryCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "code_invalid_chars");

const nameSchema = z.string().trim().min(1).max(200);
const noteSchema = z.string().trim().max(2000).nullable().optional();
const kindSchema = z.enum(STOCK_CATEGORY_KINDS as unknown as [StockCategoryKind, ...StockCategoryKind[]]);
const unitSchema = z.enum(STOCK_UNITS as unknown as [StockUnit, ...StockUnit[]]);
const quantitySchema = z.number().finite().max(MAX_STOCK_QUANTITY);
const moneyTotalSchema = z.number().finite().min(0).max(999_999_999);

export const stockCategoryCreateSchema = z.object({
  code: stockCategoryCodeSchema,
  kind: kindSchema,
  nameRo: nameSchema,
  nameRu: nameSchema,
  nameEn: nameSchema,
  unit: unitSchema,
  sortOrder: z.number().int().min(-100_000).max(100_000).optional(),
  isActive: z.boolean().optional(),
  printMethods: printMethodsSchema.optional(),
});
export type StockCategoryCreateBody = z.infer<typeof stockCategoryCreateSchema>;

/** The code is the URL slug and stays fixed; `unit` may change only while the category is empty. */
export const stockCategoryUpdateSchema = stockCategoryCreateSchema.omit({ code: true }).partial();
export type StockCategoryUpdateBody = z.infer<typeof stockCategoryUpdateSchema>;

export const stockVariantOptionsSchema = z.object({
  color: z.string().trim().max(60).optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  size: z.string().trim().max(30).optional(),
});

export const stockVariantInputSchema = z.object({
  sku: stockSkuSchema,
  label: z.string().trim().max(120).nullable().optional(),
  options: stockVariantOptionsSchema.optional(),
  sellPrice: mdlPriceSchema.nullable().optional(),
  dealerPrice: mdlPriceSchema.nullable().optional(),
  purchaseCost: mdlPriceSchema.nullable().optional(),
  reorderLevel: quantitySchema.min(0).nullable().optional(),
  /** Run-size prices of printed apparel; null clears them. */
  priceTiers: garmentPriceTiersSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(-100_000).max(100_000).optional(),
});
export type StockVariantInput = z.infer<typeof stockVariantInputSchema>;

export const stockVariantUpdateSchema = stockVariantInputSchema.partial();
export type StockVariantUpdateBody = z.infer<typeof stockVariantUpdateSchema>;

const itemFields = {
  sku: stockSkuSchema,
  nameRo: nameSchema,
  nameRu: nameSchema,
  nameEn: nameSchema,
  imageUrl: z.string().trim().max(2000).nullable().optional(),
  internalNotes: noteSchema,
  isActive: z.boolean().optional(),
  isSellable: z.boolean().optional(),
  sortOrder: z.number().int().min(-100_000).max(100_000).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  /** Own print methods; [] = the category's. */
  printMethods: printMethodsSchema.optional(),
};

export const stockItemCreateSchema = z
  .object({
    categoryId: z.string().uuid(),
    ...itemFields,
    /** Default run-size prices for variants that don't carry their own `priceTiers`. */
    priceTiers: garmentPriceTiersSchema.nullable().optional(),
    variants: z.array(stockVariantInputSchema).min(1).max(300),
  })
  .superRefine((body, ctx) => {
    const dup: string[] = duplicateSkus(body.variants.map((v) => v.sku));
    if (dup.length > 0) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: `duplicate_variant_sku:${dup.join(",")}` });
    }
  });
export type StockItemCreateBody = z.infer<typeof stockItemCreateSchema>;

export const stockItemUpdateSchema = z.object(itemFields).partial();
export type StockItemUpdateBody = z.infer<typeof stockItemUpdateSchema>;

const receiptMeta = {
  purchasedAt: z.coerce.date(),
  supplierName: z.string().trim().max(500).nullable().optional(),
  note: noteSchema,
};

export const stockReceiveSchema = z.object({
  quantity: quantitySchema.positive(),
  totalCostMdl: moneyTotalSchema,
  ...receiptMeta,
});
export type StockReceiveBody = z.infer<typeof stockReceiveSchema>;

/** One supplier delivery for many variants (category-level «Приход на склад»). */
export const stockBulkReceiptSchema = z.object({
  ...receiptMeta,
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: quantitySchema.positive(),
        totalCostMdl: moneyTotalSchema,
      }),
    )
    .min(1)
    .max(500),
});
export type StockBulkReceiptBody = z.infer<typeof stockBulkReceiptSchema>;

export const stockAdjustSchema = z.object({
  actualQuantity: quantitySchema.min(0),
  note: noteSchema,
});
export type StockAdjustBody = z.infer<typeof stockAdjustSchema>;

export const stockWriteOffSchema = z.object({
  quantity: quantitySchema.positive(),
  note: noteSchema,
});
export type StockWriteOffBody = z.infer<typeof stockWriteOffSchema>;

export const stockMovementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
