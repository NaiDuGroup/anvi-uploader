import { z } from "zod";
import { shopPhoneE164 } from "../checkoutSchema";
import { SHOP_DELIVERY_METHODS } from "../constants";

/** `PATCH /api/shop/account/profile` body: name, phone, saved delivery (all optional). */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const shopProfileSchema = z.object({
  name: text(100),
  phone: z
    .union([z.literal(""), z.string().trim().max(30).regex(/^\+?[\d\s().-]+$/).refine((p) => p.replace(/\D/g, "").length >= 8)])
    .optional()
    .transform((v) => (v ? shopPhoneE164(v) : undefined)),
  delivery: z
    .object({ method: z.enum(SHOP_DELIVERY_METHODS), city: text(100), address: text(300), note: text(500) })
    .optional(),
});

