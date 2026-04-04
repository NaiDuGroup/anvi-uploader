import { z } from "zod";

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

export const createAdminOrderSchema = z.object({
  phone: z.string().min(8, "Phone number must be at least 8 characters"),
  clientName: z.string().max(100).optional(),
  clientId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
  price: z.number().int().min(0).nullable().optional(),
  files: z.array(fileSchema).min(1, "At least one file is required"),
});

export type CreateAdminOrderInput = z.infer<typeof createAdminOrderSchema>;

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
    }
  });

export type CreateClientBody = z.infer<typeof createClientBodySchema>;

export function getClientVisibleStatus(status: string): "inProgress" | "ready" | "issue" {
  if (status === "DELIVERED") return "ready";
  if (status === "ISSUE") return "issue";
  return "inProgress";
}
