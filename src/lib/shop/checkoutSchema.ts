import { z } from "zod";
import { parseOrderFileUploadedAt } from "@/lib/orderFileLifecycle";
import {
  SHOP_CHECKOUT_MAX_FILES_PER_LINE,
  SHOP_CHECKOUT_MAX_LINES,
  SHOP_DELIVERY_METHODS,
  deliveryNeedsAddress,
} from "./constants";

/**
 * `POST /api/shop/checkout` request body. Each line's `quote` stays raw here:
 * it is validated and priced by `quotePublicLines` (the same shape as
 * `POST /api/public/quote`). Unknown extra fields (e.g. a client-side total)
 * are stripped and never read.
 */

/**
 * An order-scope upload key (`uploads/<13-digit ms>-<id>-<name>`, as
 * `POST /api/upload-url` scope `order` issues it). Anything else — catalog,
 * company, workshop layouts, URLs — is refused.
 */
export function isOrderUploadKey(key: string): boolean {
  if (!key.startsWith("uploads/") || key.includes("..") || key.includes("\\")) return false;
  return parseOrderFileUploadedAt(key) != null;
}

const fileRefSchema = z.object({
  fileKey: z.string().trim().min(1).max(500).refine(isOrderUploadKey, { message: "invalid_file_key" }),
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().nonnegative().max(5_000_000_000).optional(),
  /** DTF: the print zone id the file is for («front» / «back»). */
  zone: z.string().trim().max(40).optional(),
});

const lineSchema = z.object({
  quote: z.unknown(),
  files: z.array(fileRefSchema).max(SHOP_CHECKOUT_MAX_FILES_PER_LINE).optional(),
  note: z.string().trim().max(1000).optional(),
  title: z.string().trim().min(1).max(200),
  optionsText: z.string().trim().max(1000).optional(),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const shopCheckoutRequestSchema = z
  .object({
    locale: z.enum(["ro", "ru"]).default("ro"),
    customer: z.object({
      name: z.string().trim().min(1).max(100),
      phone: z
        .string()
        .trim()
        .min(8)
        .max(30)
        .regex(/^\+?[\d\s()-]+$/, { message: "invalid_phone" })
        .refine((p) => p.replace(/\D/g, "").length >= 8, { message: "invalid_phone" }),
      email: z
        .union([z.string().trim().email().max(200), z.literal("")])
        .optional()
        .transform((v) => (v ? v.toLowerCase() : undefined)),
    }),
    delivery: z
      .object({
        method: z.enum(SHOP_DELIVERY_METHODS),
        city: optionalText(100),
        address: optionalText(300),
        note: optionalText(500),
      })
      .superRefine((d, ctx) => {
        if (!deliveryNeedsAddress(d.method)) return;
        if (!d.city) ctx.addIssue({ code: "custom", message: "required", path: ["city"] });
        if (!d.address) ctx.addIssue({ code: "custom", message: "required", path: ["address"] });
      }),
    lines: z.array(lineSchema).min(1).max(SHOP_CHECKOUT_MAX_LINES),
    acceptTerms: z.literal(true, { message: "terms_required" }),
  });

export type ShopCheckoutRequest = z.infer<typeof shopCheckoutRequestSchema>;
export type ShopCheckoutLine = ShopCheckoutRequest["lines"][number];

/** Zod issues → `{ "customer.phone": "too_small", … }` (first issue per field). */
export function checkoutFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (out[key]) continue;
    out[key] = issue.code === "custom" || issue.message.startsWith("invalid_") || issue.message === "terms_required"
      ? issue.message
      : issue.code;
  }
  return out;
}
