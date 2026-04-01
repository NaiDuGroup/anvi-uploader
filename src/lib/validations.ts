import { z } from "zod";

// ---------------------------------------------------------------------------
// File & Order (public upload — unchanged)
// ---------------------------------------------------------------------------

export const fileSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileUrl: z.string().min(1, "File URL or key is required"),
  copies: z.number().min(1, "At least 1 copy required"),
  color: z.enum(["bw", "color"]),
  paperType: z.string().optional(),
  pageCount: z.number().int().min(1).optional(),
});

export const createOrderSchema = z.object({
  phone: z.string().min(8, "Phone number must be at least 8 characters"),
  notes: z.string().max(500).optional(),
  files: z.array(fileSchema).min(1, "At least one file is required"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type FileInput = z.infer<typeof fileSchema>;

// ---------------------------------------------------------------------------
// Admin order with order items (multi-position)
// ---------------------------------------------------------------------------

export const orderItemFileSchema = z.object({
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  pageCount: z.number().int().min(1).optional(),
});

export const PRICING_MODELS = ["fixed", "per_sqm", "per_unit"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const orderItemSchema = z.object({
  categoryId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  customerProvided: z.boolean().optional(),
  quantity: z.number().int().min(1).default(1),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  unitPrice: z.number().min(0).optional(),
  totalPrice: z.number().min(0).optional(),
  priceOverride: z.boolean().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(500).optional(),
  files: z.array(orderItemFileSchema).min(1, "At least one file per item"),
});

export const createAdminOrderSchema = z.object({
  phone: z.string().min(8, "Phone number must be at least 8 characters"),
  clientName: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(orderItemSchema).min(1, "At least one order item is required"),
});

export type CreateAdminOrderInput = z.infer<typeof createAdminOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type OrderItemFileInput = z.infer<typeof orderItemFileSchema>;

// ---------------------------------------------------------------------------
// Order update
// ---------------------------------------------------------------------------

export const editItemFileSchema = z.union([
  z.object({ existingFileId: z.string().uuid() }),
  z.object({
    fileName: z.string().min(1),
    fileUrl: z.string().min(1),
    pageCount: z.number().int().min(1).optional(),
  }),
]);

export const editOrderItemSchema = z.object({
  categoryId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  customerProvided: z.boolean().optional(),
  quantity: z.number().int().min(1).default(1),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  unitPrice: z.number().min(0).optional(),
  totalPrice: z.number().min(0).optional(),
  priceOverride: z.boolean().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(500).optional(),
  files: z.array(editItemFileSchema).min(1, "At least one file per item"),
});

export const updateOrderSchema = z.object({
  status: z
    .enum([
      "NEW",
      "IN_PROGRESS",
      "SENT_TO_WORKSHOP",
      "WORKSHOP_PRINTING",
      "WORKSHOP_READY",
      "RETURNED_TO_STUDIO",
      "DELIVERED",
      "ISSUE",
    ])
    .optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  isWorkshop: z.boolean().optional(),
  isPrio: z.boolean().optional(),
  issueReason: z.string().max(500).optional(),
  phone: z.string().min(8).optional(),
  clientName: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  items: z.array(editOrderItemSchema).min(1).optional(),
});

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

// ---------------------------------------------------------------------------
// Order statuses
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
  "RETURNED_TO_STUDIO",
  "DELIVERED",
  "ISSUE",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function getClientVisibleStatus(status: string): "inProgress" | "ready" | "issue" {
  if (status === "DELIVERED") return "ready";
  if (status === "ISSUE") return "issue";
  return "inProgress";
}

// ---------------------------------------------------------------------------
// Product Catalog schemas
// ---------------------------------------------------------------------------

const ATTRIBUTE_FIELD_TYPES = ["text", "number", "select", "boolean"] as const;
export type AttributeFieldType = (typeof ATTRIBUTE_FIELD_TYPES)[number];

export const i18nLabelSchema = z.object({
  ro: z.string().min(1),
  ru: z.string().min(1),
  en: z.string().min(1),
});

export const attributeOptionSchema = z.object({
  value: z.string().min(1),
  label: i18nLabelSchema,
});

export const attributeFieldSchema = z.object({
  key: z.string().min(1).max(50),
  label: i18nLabelSchema,
  type: z.enum(ATTRIBUTE_FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(attributeOptionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const attributeSchemaSchema = z.object({
  fields: z.array(attributeFieldSchema),
});

export type AttributeField = z.infer<typeof attributeFieldSchema>;
export type AttributeOption = z.infer<typeof attributeOptionSchema>;
export type AttributeSchema = z.infer<typeof attributeSchemaSchema>;
export type I18nLabel = z.infer<typeof i18nLabelSchema>;

// Surcharge: extra cost for an option (e.g. "rounded corners +0.5 lei")
export const surchargeSchema = z.object({
  key: z.string().min(1).max(50),
  label: i18nLabelSchema,
  pricePerUnit: z.number().min(0),
  appliesToAttribute: z.string().max(50).optional(),
});

export type Surcharge = z.infer<typeof surchargeSchema>;

// Price tier: quantity breakpoint with per-unit price
export const priceTierSchema = z.object({
  minQty: z.number().int().min(1),
  maxQty: z.number().int().min(1).nullable().optional(),
  price: z.number().min(0),
  totalFixed: z.number().min(0).nullable().optional(),
});

export type PriceTier = z.infer<typeof priceTierSchema>;

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  attributeSchema: attributeSchemaSchema,
  pricingModel: z.enum(PRICING_MODELS).optional(),
  servicePriceDefault: z.number().min(0).nullable().optional(),
  dimensionsRequired: z.boolean().optional(),
  surcharges: z.array(surchargeSchema).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  imageUrl: z.string().max(500).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  costPrice: z.number().min(0).nullable().optional(),
  sellingPrice: z.number().min(0).nullable().optional(),
  priceTiers: z.array(priceTierSchema).nullable().optional(),
  minQuantity: z.number().int().min(1).nullable().optional(),
  leadTimeDays: z.string().max(50).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
