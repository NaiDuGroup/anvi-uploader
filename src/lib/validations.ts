import { z } from "zod";

export const fileSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileUrl: z.string().min(1, "File URL or key is required"),
  copies: z.number().min(1, "At least 1 copy required"),
  color: z.enum(["bw", "color"]),
  paperType: z.string().optional(),
});

export const createOrderSchema = z.object({
  phone: z.string().min(8, "Phone number must be at least 8 characters"),
  files: z.array(fileSchema).min(1, "At least one file is required"),
});

export const updateOrderSchema = z.object({
  status: z
    .enum([
      "NEW",
      "IN_PROGRESS",
      "ASSIGNED",
      "SENT_TO_WORKSHOP",
      "WORKSHOP_PRINTING",
      "READY",
      "ISSUE",
    ])
    .optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  isWorkshop: z.boolean().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type FileInput = z.infer<typeof fileSchema>;

export const ORDER_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "ASSIGNED",
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "READY",
  "ISSUE",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function getClientVisibleStatus(status: string): string {
  if (status === "READY") return "Ready";
  return "In progress";
}
