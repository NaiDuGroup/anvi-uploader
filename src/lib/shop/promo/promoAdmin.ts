import { z } from "zod";
import { round2 } from "@/lib/money";
import { isShopReportCategory } from "@/lib/shop/lineProduct";
import { addDays, dayKeyOf, dayStart, isDayKey } from "@/lib/shop/report/period";
import { normalizePromoCode, PROMO_TYPES } from "./promoCore";

/**
 * Admin «Промокоды» input (create / edit) and the list row. Dates are
 * Chișinău calendar days: «с» = 00:00 of that day, «по» = the end of that
 * day (inclusive). Pure (client-safe).
 */

const day = z
  .string()
  .trim()
  .refine((v) => v === "" || isDayKey(v), { message: "invalid_date" })
  .nullish()
  .transform((v) => (v ? v : null));

const intOrNull = z
  .union([z.number().int().min(1).max(1_000_000), z.null()])
  .optional()
  .transform((v) => v ?? null);

export const promoInputSchema = z
  .object({
    code: z
      .string()
      .transform((v) => normalizePromoCode(v) ?? "")
      .refine((v) => v.length >= 3, { message: "invalid_code" }),
    type: z.enum(PROMO_TYPES),
    value: z.number().min(0).max(1_000_000).default(0),
    minOrderMdl: z
      .union([z.number().min(0).max(10_000_000), z.null()])
      .optional()
      .transform((v) => (v == null || v === 0 ? null : round2(v))),
    validFrom: day,
    validTo: day,
    maxUsesTotal: intOrNull,
    maxUsesPerCustomer: intOrNull,
    categories: z
      .array(z.string())
      .max(30)
      .default([])
      .refine((a) => a.every(isShopReportCategory), { message: "invalid_category" }),
    products: z
      .array(z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/))
      .max(200)
      .default([]),
    active: z.boolean().default(true),
    note: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((d, ctx) => {
    if (d.type === "percent" && (d.value <= 0 || d.value > 100)) {
      ctx.addIssue({ code: "custom", message: "invalid_percent", path: ["value"] });
    }
    if (d.type === "fixed" && d.value <= 0) ctx.addIssue({ code: "custom", message: "invalid_value", path: ["value"] });
    if (d.validFrom && d.validTo && d.validFrom > d.validTo) {
      ctx.addIssue({ code: "custom", message: "invalid_period", path: ["validTo"] });
    }
  })
  .transform((d) => ({ ...d, value: d.type === "free_delivery" ? 0 : round2(d.value) }));

export type PromoInput = z.infer<typeof promoInputSchema>;

/** Calendar days → the stored instants. */
export function promoDatesToDb(validFrom: string | null, validTo: string | null): { validFrom: Date | null; validTo: Date | null } {
  return {
    validFrom: validFrom ? dayStart(validFrom) : null,
    validTo: validTo ? new Date(dayStart(addDays(validTo, 1)).getTime() - 1) : null,
  };
}

/** One row of the admin list (JSON). */
export interface PromoAdminRow {
  id: string;
  code: string;
  type: string;
  value: number;
  minOrderMdl: number | null;
  validFrom: string | null;
  validTo: string | null;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number | null;
  categories: string[];
  products: string[];
  active: boolean;
  usesCount: number;
  /** Unpaid orders placed with the code (not yet a use). */
  pendingOrders: number;
  /** Orders that ever used the code (blocks deleting it). */
  ordersCount: number;
  note: string | null;
  createdAt: string;
}

type Decimalish = { toString(): string } | number | null | undefined;
const n = (v: Decimalish): number | null => (v == null ? null : Number(v.toString()));

export function promoAdminRow(
  row: {
    id: string;
    code: string;
    type: string;
    value: Decimalish;
    minOrderMdl: Decimalish;
    validFrom: Date | null;
    validTo: Date | null;
    maxUsesTotal: number | null;
    maxUsesPerCustomer: number | null;
    categories: string[];
    products: string[];
    active: boolean;
    usesCount: number;
    note: string | null;
    createdAt: Date;
  },
  counts: { pendingOrders: number; ordersCount: number },
): PromoAdminRow {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: n(row.value) ?? 0,
    minOrderMdl: n(row.minOrderMdl),
    validFrom: row.validFrom ? dayKeyOf(row.validFrom) : null,
    validTo: row.validTo ? dayKeyOf(row.validTo) : null,
    maxUsesTotal: row.maxUsesTotal,
    maxUsesPerCustomer: row.maxUsesPerCustomer,
    categories: row.categories,
    products: row.products,
    active: row.active,
    usesCount: row.usesCount,
    pendingOrders: counts.pendingOrders,
    ordersCount: counts.ordersCount,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Where the code stands today: active / scheduled / expired / used up / off. */
export type PromoAdminState = "active" | "scheduled" | "expired" | "used_up" | "off";

export function promoAdminState(r: Pick<PromoAdminRow, "active" | "validFrom" | "validTo" | "maxUsesTotal" | "usesCount">, today: string): PromoAdminState {
  if (!r.active) return "off";
  if (r.validTo && today > r.validTo) return "expired";
  if (r.validFrom && today < r.validFrom) return "scheduled";
  if (r.maxUsesTotal != null && r.usesCount >= r.maxUsesTotal) return "used_up";
  return "active";
}
