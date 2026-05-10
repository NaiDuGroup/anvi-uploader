import { z } from "zod";

export const fileSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileUrl: z.string().min(1, "File URL or key is required"),
  copies: z.number().min(1, "At least 1 copy required"),
  color: z.enum(["bw", "color"]),
  paperType: z.string().optional(),
  pageCount: z.number().int().min(1).optional(),
});

export const PRODUCT_TYPES = ["paper_print", "mug", "notebook"] as const;
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
  if (data.productType === "mug") {
    if (data.mugOther === true) {
      if (data.mugProductId) {
        ctx.addIssue({
          code: "custom",
          message: "mug_other_exclusive",
          path: ["mugProductId"],
        });
      }
      return;
    }
    if (!data.mugProductId) {
      ctx.addIssue({
        code: "custom",
        message: "mug_product_required",
        path: ["mugProductId"],
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
          path: ["notebookProductId"],
        });
      }
      return;
    }
    if (!data.notebookProductId) {
      ctx.addIssue({
        code: "custom",
        message: "notebook_product_required",
        path: ["notebookProductId"],
      });
    }
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
    files: z.array(fileSchema).min(1, "At least one file is required"),
  })
  .superRefine(refineProductSelection);

export const createAdminOrderSchema = z
  .object({
    phone: z.string().min(8, "Phone number must be at least 8 characters"),
    clientName: z.string().max(100).optional(),
    clientId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
    price: z.number().int().min(0).nullable().optional(),
    productType: z.enum(PRODUCT_TYPES).default("paper_print"),
    mugLayoutData: mugLayoutDataSchema.optional(),
    mugProductId: z.string().uuid().optional(),
    mugOther: z.boolean().optional(),
    notebookLayoutData: notebookLayoutDataSchema.optional(),
    notebookProductId: z.string().uuid().optional(),
    notebookOther: z.boolean().optional(),
    files: z.array(fileSchema).min(1, "At least one file is required"),
    /**
     * Optional reference to an existing InvoiceLineItem. When set, the
     * admin order POST handler will (in the same transaction) attach the
     * newly created order to that line item so that the invoice "Create
     * order from line" flow can be one-shot.
     */
    fromInvoiceLineItemId: z.string().uuid().optional(),
  })
  .superRefine(refineProductSelection);

export type CreateAdminOrderInput = z.infer<typeof createAdminOrderSchema>;

export const updateOrderSchema = z.object({
  status: z
    .enum([
      "NEW",
      "IN_PROGRESS",
      "PENDING_APPROVAL",
      "CHANGES_REQUESTED",
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
  price: z.number().int().min(0).nullable().optional(),
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
  "PENDING_APPROVAL",
  "CHANGES_REQUESTED",
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
    companyIban: z.string().max(80).optional(),
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
      if (!data.companyIban?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "legal_iban",
          path: ["companyIban"],
        });
      }
      if (!data.personName?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "legal_contact",
          path: ["personName"],
        });
      }
    }
  });

export type CreateClientBody = z.infer<typeof createClientBodySchema>;

export type ClientVisibleStatus = "inProgress" | "ready" | "issue" | "pendingApproval" | "changesRequested";

export function getClientVisibleStatus(status: string): ClientVisibleStatus {
  if (status === "DELIVERED") return "ready";
  if (status === "ISSUE") return "issue";
  if (status === "PENDING_APPROVAL") return "pendingApproval";
  if (status === "CHANGES_REQUESTED") return "changesRequested";
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
    companyIban: z.string().max(80).optional(),
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
    companyIban: z.string().max(80).optional(),
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
  logoPath: z.string().max(500).nullable().optional(),
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
 * - DRAFT: any field including replacing lineItems.
 * - ISSUED: only notes/paidNote (no money fields).
 * - PAID/CANCELLED: route returns 409.
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
