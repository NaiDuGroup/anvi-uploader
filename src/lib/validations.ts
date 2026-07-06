import { z } from "zod";
import { LF_ROLL_PACK_MAX_QUANTITY } from "@/lib/largeFormat/largeFormatRollConstants";
import {
  BUSINESS_EXPENSE_PERIODS,
  BUSINESS_EXPENSE_TYPES,
  productionCostsConfigSchema,
} from "@/lib/accounting/types";

/**
 * Shared shape for MDL money values that map to `Decimal(12, 2)` DB
 * columns (`Order.price`, `MugProduct.sellPrice/dealerPrice/purchaseCost`,
 * `NotebookProduct.*`). Accepts non-negative `number`s with at most 2
 * fractional digits — `1`, `1.5`, `1.50`, `100.99` are valid; `1.234`,
 * negatives, and values beyond the column width are rejected.
 *
 * The 2dp check uses `Math.round(n * 100) === n * 100`, which mirrors
 * `round2` semantics and tolerates the float representation issues that
 * `parseFloat("1.5")` would otherwise hide.
 */
export const mdlPriceSchema = z
  .number()
  .nonnegative("price_non_negative")
  .max(99_999_999.99, "price_too_large")
  .refine((n) => Math.round(n * 100) === n * 100, {
    message: "price_max_2_decimals",
  });

export const fileSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileUrl: z.string().min(1, "File URL or key is required"),
  copies: z.number().min(1, "At least 1 copy required"),
  color: z.enum(["bw", "color"]),
  paperType: z.string().optional(),
  pageCount: z.number().int().min(1).optional(),
});

export const PRODUCT_TYPES = ["paper_print", "mug", "notebook", "large_format_print"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const mugLayoutDataSchema = z.object({
  templateId: z.string(),
  text: z.string(),
  fontFamily: z.string(),
  textColor: z.string(),
  backgroundColor: z.string(),
  photoUrls: z.array(z.string()),
  photoSettings: z.array(z.object({
    fitMode: z.enum(["cover", "contain"]),
    alignment: z.enum(["left", "center", "right"]),
    verticalAlignment: z.enum(["top", "center", "bottom"]).optional().default("center"),
    naturalWidth: z.number().optional(),
    naturalHeight: z.number().optional(),
  })),
  /** @deprecated Legacy; use Order.mugProductSnapshot for mug colour. */
  mugHandleColorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "mugHandleColorHex must be #RRGGBB")
    .optional(),
});

export type MugLayoutData = z.infer<typeof mugLayoutDataSchema>;

export const notebookLayoutDataSchema = z.object({
  templateId: z.string(),
  text: z.string(),
  fontFamily: z.string(),
  textColor: z.string(),
  backgroundColor: z.string(),
  photoUrls: z.array(z.string()),
  photoSettings: z.array(z.object({
    fitMode: z.enum(["cover", "contain"]),
    alignment: z.enum(["left", "center", "right"]),
    verticalAlignment: z.enum(["top", "center", "bottom"]).optional().default("center"),
    naturalWidth: z.number().optional(),
    naturalHeight: z.number().optional(),
  })),
});

export type NotebookLayoutData = z.infer<typeof notebookLayoutDataSchema>;

function refineProductSelection(
  data: {
    productType: ProductType;
    mugProductId?: string;
    mugOther?: boolean;
    notebookProductId?: string;
    notebookOther?: boolean;
  },
  ctx: z.RefinementCtx,
) {
  refineProductSelectionAtPath(data, ctx, []);
}

/** Path prefix for nested admin order lines, e.g. `["lines", 0]`. */
function refineProductSelectionAtPath(
  data: {
    productType: ProductType;
    mugProductId?: string;
    mugOther?: boolean;
    notebookProductId?: string;
    notebookOther?: boolean;
  },
  ctx: z.RefinementCtx,
  pathPrefix: (string | number)[],
) {
  if (data.productType === "mug") {
    if (data.mugOther === true) {
      if (data.mugProductId) {
        ctx.addIssue({
          code: "custom",
          message: "mug_other_exclusive",
          path: [...pathPrefix, "mugProductId"],
        });
      }
      return;
    }
    if (!data.mugProductId) {
      ctx.addIssue({
        code: "custom",
        message: "mug_product_required",
        path: [...pathPrefix, "mugProductId"],
      });
    }
    return;
  }
  if (data.productType === "notebook") {
    if (data.notebookOther === true) {
      if (data.notebookProductId) {
        ctx.addIssue({
          code: "custom",
          message: "notebook_other_exclusive",
          path: [...pathPrefix, "notebookProductId"],
        });
      }
      return;
    }
    if (!data.notebookProductId) {
      ctx.addIssue({
        code: "custom",
        message: "notebook_product_required",
        path: [...pathPrefix, "notebookProductId"],
      });
    }
  }
}

function refineLargeFormatLineAtPath(
  data: {
    productType: ProductType;
    largeFormatMaterialId?: string;
    printWidthCm?: number;
    printHeightCm?: number;
    quantity?: number;
    customerType?: "retail" | "dealer";
  },
  ctx: z.RefinementCtx,
  pathPrefix: (string | number)[],
) {
  if (data.productType !== "large_format_print") {
    return;
  }
  if (!data.largeFormatMaterialId) {
    ctx.addIssue({
      code: "custom",
      message: "lf_material_required",
      path: [...pathPrefix, "largeFormatMaterialId"],
    });
  }
  if (data.printWidthCm == null || !Number.isFinite(data.printWidthCm)) {
    ctx.addIssue({
      code: "custom",
      message: "lf_width_required",
      path: [...pathPrefix, "printWidthCm"],
    });
  } else if (data.printWidthCm <= 0) {
    ctx.addIssue({
      code: "custom",
      message: "lf_width_positive",
      path: [...pathPrefix, "printWidthCm"],
    });
  }
  if (data.printHeightCm == null || !Number.isFinite(data.printHeightCm)) {
    ctx.addIssue({
      code: "custom",
      message: "lf_height_required",
      path: [...pathPrefix, "printHeightCm"],
    });
  } else if (data.printHeightCm <= 0) {
    ctx.addIssue({
      code: "custom",
      message: "lf_height_positive",
      path: [...pathPrefix, "printHeightCm"],
    });
  }
  if (data.quantity == null || !Number.isFinite(data.quantity)) {
    ctx.addIssue({
      code: "custom",
      message: "lf_quantity_required",
      path: [...pathPrefix, "quantity"],
    });
  } else if (!Number.isInteger(data.quantity) || data.quantity < 1) {
    ctx.addIssue({
      code: "custom",
      message: "lf_quantity_min",
      path: [...pathPrefix, "quantity"],
    });
  }
  if (!data.customerType) {
    ctx.addIssue({
      code: "custom",
      message: "lf_customer_type_required",
      path: [...pathPrefix, "customerType"],
    });
  }
  if (
    data.quantity != null &&
    Number.isFinite(data.quantity) &&
    Number.isInteger(data.quantity) &&
    data.quantity > LF_ROLL_PACK_MAX_QUANTITY
  ) {
    ctx.addIssue({
      code: "custom",
      message: "lf_quantity_pack_cap",
      path: [...pathPrefix, "quantity"],
    });
  }
}

export const createOrderSchema = z
  .object({
    // Phone is optional at the schema level. The route-level handler is
    // responsible for either sourcing it from a logged-in customer session
    // (cabinet flow) or rejecting the request when anonymous and missing.
    phone: z.string().min(8, "Phone number must be at least 8 characters").optional(),
    notes: z.string().max(500).optional(),
    productType: z.enum(PRODUCT_TYPES).default("paper_print"),
    mugLayoutData: mugLayoutDataSchema.optional(),
    mugProductId: z.string().uuid().optional(),
    mugOther: z.boolean().optional(),
    notebookLayoutData: notebookLayoutDataSchema.optional(),
    notebookProductId: z.string().uuid().optional(),
    notebookOther: z.boolean().optional(),
    // Large-format fields (cabinet flow). `customerType` is intentionally NOT
    // accepted from the client — the route derives the tier from the logged-in
    // customer's dealer flag so pricing cannot be tampered with.
    largeFormatMaterialId: z.string().uuid().optional(),
    printWidthCm: z.number().optional(),
    printHeightCm: z.number().optional(),
    quantity: z.number().int().min(1).max(LF_ROLL_PACK_MAX_QUANTITY).optional(),
    lfSizePresetId: z.string().uuid().nullable().optional(),
    files: z.array(fileSchema).min(1, "At least one file is required"),
  })
  .superRefine(refineProductSelection)
  .superRefine((data, ctx) => {
    if (data.productType !== "large_format_print") return;
    // Large format requires a customer session — enforced in the route handler
    // (anonymous public callers are rejected there). Here we only validate the
    // line inputs. `customerType` is omitted on purpose (server-derived).
    refineLargeFormatLineAtPath(
      {
        productType: data.productType,
        largeFormatMaterialId: data.largeFormatMaterialId,
        printWidthCm: data.printWidthCm,
        printHeightCm: data.printHeightCm,
        quantity: data.quantity,
        // Satisfy the shared refine without forcing the client to send a tier.
        customerType: "retail",
      },
      ctx,
      [],
    );
  });

const adminOrderLineSchema = z.object({
  productType: z.enum(PRODUCT_TYPES),
  mugLayoutData: mugLayoutDataSchema.optional(),
  mugProductId: z.string().uuid().optional(),
  mugOther: z.boolean().optional(),
  notebookLayoutData: notebookLayoutDataSchema.optional(),
  notebookProductId: z.string().uuid().optional(),
  notebookOther: z.boolean().optional(),
  largeFormatMaterialId: z.string().uuid().optional(),
  printWidthCm: z.number().optional(),
  printHeightCm: z.number().optional(),
  quantity: z.number().int().min(1).max(999_999).optional(),
  customerType: z.enum(["retail", "dealer"]).optional(),
  /** Optional preset id from the material's size price list; locks the line price. */
  lfSizePresetId: z.string().uuid().nullable().optional(),
  files: z.array(fileSchema).min(1, "At least one file is required"),
});

export const createAdminOrderSchema = z
  .object({
    phone: z.string().min(8, "Phone number must be at least 8 characters"),
    clientName: z.string().max(100).optional(),
    clientId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
    price: mdlPriceSchema.nullable().optional(),
    /** Legacy single-line body: `productType` + top-level `files`. */
    productType: z.enum(PRODUCT_TYPES).optional(),
    mugLayoutData: mugLayoutDataSchema.optional(),
    mugProductId: z.string().uuid().optional(),
    mugOther: z.boolean().optional(),
    notebookLayoutData: notebookLayoutDataSchema.optional(),
    notebookProductId: z.string().uuid().optional(),
    notebookOther: z.boolean().optional(),
    files: z.array(fileSchema).optional(),
    /** Multi-line admin orders: one entry per product block; exclusive with legacy fields. */
    lines: z.array(adminOrderLineSchema).optional(),
    /**
     * Optional reference to an existing InvoiceLineItem. When set, the
     * admin order POST handler will (in the same transaction) attach the
     * newly created order to that line item so that the invoice "Create
     * order from line" flow can be one-shot.
     */
    fromInvoiceLineItemId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    const hasLines = (data.lines?.length ?? 0) > 0;
    const hasLegacy = (data.files?.length ?? 0) > 0;

    if (!hasLines && !hasLegacy) {
      ctx.addIssue({
        code: "custom",
        message: "admin_order_lines_or_legacy_required",
        path: ["lines"],
      });
      return;
    }
    if (hasLines && hasLegacy) {
      ctx.addIssue({
        code: "custom",
        message: "admin_order_lines_and_legacy_conflict",
        path: ["lines"],
      });
      return;
    }
    if (hasLegacy) {
      const productType: ProductType = data.productType ?? "paper_print";
      if (productType === "large_format_print") {
        ctx.addIssue({
          code: "custom",
          message: "lf_requires_multiline_body",
          path: ["lines"],
        });
        return;
      }
      refineProductSelection(
        {
          productType,
          mugProductId: data.mugProductId,
          mugOther: data.mugOther,
          notebookProductId: data.notebookProductId,
          notebookOther: data.notebookOther,
        },
        ctx,
      );
      return;
    }
    data.lines!.forEach((line, i) => {
      refineProductSelectionAtPath(
        {
          productType: line.productType,
          mugProductId: line.mugProductId,
          mugOther: line.mugOther,
          notebookProductId: line.notebookProductId,
          notebookOther: line.notebookOther,
        },
        ctx,
        ["lines", i],
      );
      refineLargeFormatLineAtPath(line, ctx, ["lines", i]);
    });
  });

export type CreateAdminOrderInput = z.infer<typeof createAdminOrderSchema>;
export type AdminOrderLineInput = z.infer<typeof adminOrderLineSchema>;

/** Existing file row: optional field overrides; merged server-side with stored file. */
export const existingAdminOrderFilePatchSchema = z.object({
  fileId: z.string().uuid(),
  copies: z.number().min(1).optional(),
  color: z.enum(["bw", "color"]).optional(),
  paperType: z.string().optional(),
  pageCount: z.number().int().min(1).nullable().optional(),
});

export const adminOrderUpdateLineSchema = z.object({
  /** When omitted or unknown, server creates a new order line row. */
  orderLineId: z.string().uuid().optional(),
  productType: z.enum(PRODUCT_TYPES),
  mugLayoutData: mugLayoutDataSchema.optional(),
  mugProductId: z.string().uuid().optional(),
  mugOther: z.boolean().optional(),
  notebookLayoutData: notebookLayoutDataSchema.optional(),
  notebookProductId: z.string().uuid().optional(),
  notebookOther: z.boolean().optional(),
  largeFormatMaterialId: z.string().uuid().optional(),
  printWidthCm: z.number().optional(),
  printHeightCm: z.number().optional(),
  quantity: z.number().int().min(1).max(999_999).optional(),
  customerType: z.enum(["retail", "dealer"]).optional(),
  /** Optional preset id from the material's size price list; locks the line price. */
  lfSizePresetId: z.string().uuid().nullable().optional(),
  files: z
    .array(z.union([existingAdminOrderFilePatchSchema, fileSchema]))
    .min(1, "At least one file is required"),
});

export const updateAdminOrderSchema = z
  .object({
    phone: z.string().min(8, "Phone number must be at least 8 characters"),
    clientName: z.string().max(100).optional(),
    clientId: z.string().uuid().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    price: mdlPriceSchema.nullable().optional(),
    lines: z.array(adminOrderUpdateLineSchema).min(1),
  })
  .superRefine((data, ctx) => {
    data.lines.forEach((line, i) => {
      refineProductSelectionAtPath(
        {
          productType: line.productType,
          mugProductId: line.mugProductId,
          mugOther: line.mugOther,
          notebookProductId: line.notebookProductId,
          notebookOther: line.notebookOther,
        },
        ctx,
        ["lines", i],
      );
    });
  });

export type UpdateAdminOrderInput = z.infer<typeof updateAdminOrderSchema>;
export type AdminOrderUpdateLineInput = z.infer<typeof adminOrderUpdateLineSchema>;

export const updateOrderSchema = z.object({
  status: z
    .enum([
      "NEW",
      "IN_PROGRESS",
      "READY_IN_STUDIO",
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
  isPaid: z.boolean().optional(),
  price: mdlPriceSchema.nullable().optional(),
  issueReason: z.string().max(500).optional(),
  phone: z.string().min(8).optional(),
  clientName: z.string().max(100).nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  removeFileIds: z.array(z.string().uuid()).optional(),
  addFiles: z.array(fileSchema).optional(),
  updateFiles: z.array(z.object({
    id: z.string().uuid(),
    copies: z.number().min(1).optional(),
    color: z.enum(["bw", "color"]).optional(),
    paperType: z.string().optional(),
  })).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type FileInput = z.infer<typeof fileSchema>;

export const ORDER_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "READY_IN_STUDIO",
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
  "RETURNED_TO_STUDIO",
  "DELIVERED",
  "ISSUE",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CLIENT_KINDS = ["INDIVIDUAL", "LEGAL"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export const createClientBodySchema = z
  .object({
    kind: z.enum(CLIENT_KINDS),
    phone: z.string().max(50).optional(),
    personName: z.string().max(200).optional(),
    companyName: z.string().max(200).optional(),
    companyIdno: z.string().max(80).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "INDIVIDUAL") {
      if (!data.phone?.trim() || data.phone.trim().length < 8) {
        ctx.addIssue({
          code: "custom",
          message: "individual_phone",
          path: ["phone"],
        });
      }
      if (!data.personName?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "individual_name",
          path: ["personName"],
        });
      }
    } else {
      if (!data.companyName?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "legal_company",
          path: ["companyName"],
        });
      }
      if (!data.companyIdno?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "legal_idno",
          path: ["companyIdno"],
        });
      }
      if (!data.personName?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "legal_contact",
          path: ["personName"],
        });
      }
      if (!data.phone?.trim() || data.phone.trim().length < 8) {
        ctx.addIssue({
          code: "custom",
          message: "legal_phone",
          path: ["phone"],
        });
      }
    }
  });

export type CreateClientBody = z.infer<typeof createClientBodySchema>;

export type ClientVisibleStatus =
  | "inProgress"
  | "ready"
  | "readyInStudio"
  | "readyInWorkshop"
  | "issue";

export function getClientVisibleStatus(status: string): ClientVisibleStatus {
  if (status === "DELIVERED") return "ready";
  // Print is finished but the job is still physically at the workshop — the
  // client can pick it up there, so it gets its own "ready at workshop" state
  // rather than the studio pickup wording.
  if (status === "WORKSHOP_READY") return "readyInWorkshop";
  // Ready and waiting for the client at the studio: either finished by the
  // studio itself (READY_IN_STUDIO) or already handed back from the workshop
  // (RETURNED_TO_STUDIO).
  if (status === "READY_IN_STUDIO" || status === "RETURNED_TO_STUDIO")
    return "readyInStudio";
  if (status === "ISSUE") return "issue";
  return "inProgress";
}

// ---------------------------------------------------------------------------
// Customer portal (личный кабинет)
// ---------------------------------------------------------------------------

const cabinetPhoneSchema = z
  .string()
  .min(8, "phone_required")
  .max(50);

const cabinetPasswordSchema = z
  .string()
  .min(8, "password_min_length")
  .max(200);

export const cabinetLoginSchema = z.object({
  phone: cabinetPhoneSchema,
  password: cabinetPasswordSchema,
});

export type CabinetLoginInput = z.infer<typeof cabinetLoginSchema>;

export const cabinetRegisterSchema = z
  .object({
    phone: cabinetPhoneSchema,
    password: cabinetPasswordSchema,
    kind: z.enum(CLIENT_KINDS).default("INDIVIDUAL"),
    personName: z.string().max(200).optional(),
    companyName: z.string().max(200).optional(),
    companyIdno: z.string().max(80).optional(),
    email: z.string().email().max(200).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "LEGAL") {
      if (!data.companyName?.trim()) {
        ctx.addIssue({ code: "custom", message: "legal_company", path: ["companyName"] });
      }
      if (!data.companyIdno?.trim()) {
        ctx.addIssue({ code: "custom", message: "legal_idno", path: ["companyIdno"] });
      }
    } else {
      if (!data.personName?.trim()) {
        ctx.addIssue({ code: "custom", message: "individual_name", path: ["personName"] });
      }
    }
  });

export type CabinetRegisterInput = z.infer<typeof cabinetRegisterSchema>;

/** Body for POST /api/admin/clients/[id]/portal-account (superadmin invite). */
export const clientPortalAccountSchema = z.object({
  password: cabinetPasswordSchema,
});

export type ClientPortalAccountInput = z.infer<typeof clientPortalAccountSchema>;

/** Body for PATCH /api/admin/clients/[id]/dealer (superadmin only). */
export const clientDealerToggleSchema = z.object({
  isDealer: z.boolean(),
});

export type ClientDealerToggleInput = z.infer<typeof clientDealerToggleSchema>;

/** Profile fields a logged-in customer may edit on themselves. Phone is read-only. */
export const cabinetProfileUpdateSchema = z
  .object({
    personName: z.string().max(200).optional(),
    companyName: z.string().max(200).optional(),
    companyIdno: z.string().max(80).optional(),
    email: z.string().email().max(200).optional().or(z.literal("")),
    password: cabinetPasswordSchema.optional(),
  });

export type CabinetProfileUpdateInput = z.infer<typeof cabinetProfileUpdateSchema>;

// ---------------------------------------------------------------------------
// Invoices ("Cont spre plata") + supplier (CompanyProfile) settings
// ---------------------------------------------------------------------------

export const INVOICE_LOCALES = ["ro", "ru", "en"] as const;
export type InvoiceLocale = (typeof INVOICE_LOCALES)[number];

export const INVOICE_STATUSES = [
  "DRAFT",
  "ISSUED",
  "PAID",
  "CANCELLED",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** PATCH body for the singleton supplier profile (superadmin only). */
export const companyProfileUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  fiscalCode: z.string().min(1).max(80).optional(),
  address: z.string().min(1).max(500).optional(),
  iban: z.string().min(1).max(80).optional(),
  bankName: z.string().min(1).max(200).optional(),
  bic: z.string().min(1).max(80).optional(),
  directorName: z.string().max(200).nullable().optional(),
  accountantName: z.string().max(200).nullable().optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  invoiceNumberPadding: z.coerce.number().int().min(1).max(10).optional(),
  invoiceValidityDays: z.coerce.number().int().min(1).max(365).optional(),
  defaultLocale: z.enum(INVOICE_LOCALES).optional(),
  currency: z.string().min(1).max(8).optional(),
  logoPath: z.string().max(2000).nullable().optional(),
  showPublicCabinetLoginCta: z.boolean().optional(),
});

export type CompanyProfileUpdateInput = z.infer<typeof companyProfileUpdateSchema>;

const invoiceLineItemInputSchema = z.object({
  description: z.string().min(1, "description_required").max(500),
  unit: z.string().min(1).max(16).optional(),
  // Quantity supports up to 3 decimals to allow fractional services if ever needed.
  quantity: z.coerce.number().positive("quantity_positive").max(99999),
  // Unit price is VAT-inclusive in V1 (matches reference PDF).
  unitPrice: z.coerce.number().nonnegative("price_non_negative").max(99999999),
  orderId: z.string().uuid().nullable().optional(),
});

export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemInputSchema>;

export const createInvoiceSchema = z.object({
  clientId: z.string().uuid(),
  locale: z.enum(INVOICE_LOCALES).optional(),
  issueDate: z.coerce.date().optional(),
  validityDays: z.coerce.number().int().min(1).max(365).optional(),
  notes: z.string().max(2000).nullable().optional(),
  lineItems: z
    .array(invoiceLineItemInputSchema)
    .min(1, "line_items_required")
    .max(50, "line_items_max"),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/**
 * PATCH body for invoices. Allowed fields depend on status (enforced in route):
 * - DRAFT & ISSUED: any field including replacing lineItems (issued number and
 *   frozen supplier/client snapshots are preserved).
 * - PAID/CANCELLED: route returns 409 (revert to ISSUED first to edit).
 */
export const updateInvoiceSchema = z.object({
  locale: z.enum(INVOICE_LOCALES).optional(),
  issueDate: z.coerce.date().optional(),
  validityDays: z.coerce.number().int().min(1).max(365).optional(),
  notes: z.string().max(2000).nullable().optional(),
  lineItems: z
    .array(invoiceLineItemInputSchema)
    .min(1)
    .max(50)
    .optional(),
});

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export const markInvoicePaidSchema = z.object({
  paidAt: z.coerce.date().optional(),
  paidNote: z.string().max(500).nullable().optional(),
});

export type MarkInvoicePaidInput = z.infer<typeof markInvoicePaidSchema>;

export const cancelInvoiceSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});

export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;

// ---------------------------------------------------------------------------
// Accounting / profitability (superadmin APIs)
// ---------------------------------------------------------------------------

export const accountingProductionSettingsPatchSchema =
  productionCostsConfigSchema;

export type AccountingProductionSettingsPatchInput = z.infer<
  typeof accountingProductionSettingsPatchSchema
>;

export const businessExpenseCreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    type: z.enum(BUSINESS_EXPENSE_TYPES),
    amount: z.number().int().min(0).max(999_999_999),
    period: z.enum(BUSINESS_EXPENSE_PERIODS),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    isActive: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        message: "end_before_start",
        path: ["endDate"],
      });
    }
  });

export type BusinessExpenseCreateInput = z.infer<
  typeof businessExpenseCreateSchema
>;

export const businessExpenseUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    type: z.enum(BUSINESS_EXPENSE_TYPES).optional(),
    amount: z.number().int().min(0).max(999_999_999).optional(),
    period: z.enum(BUSINESS_EXPENSE_PERIODS).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    isActive: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        message: "end_before_start",
        path: ["endDate"],
      });
    }
  });

export type BusinessExpenseUpdateInput = z.infer<
  typeof businessExpenseUpdateSchema
>;
