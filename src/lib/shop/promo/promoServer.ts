import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadShopLineRefResolver } from "@/lib/shop/lineProductServer";
import {
  evaluatePromo,
  normalizePromoCode,
  promoHasRestrictions,
  type PromoCartLine,
  type PromoCodeRule,
  type PromoResult,
} from "./promoCore";
import { PROMO_PENDING_HOLD_MS, promoHeldOrdersWhere, promoRealOrdersWhere } from "./promoOrdersWhere";

/**
 * Server side of storefront promo codes: load the code, count its uses and
 * apply it to a priced cart. The only place a promo discount is decided.
 */

export { PROMO_PENDING_HOLD_MS };

type Decimalish = { toString(): string } | number | null | undefined;

function num(v: Decimalish): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

/** A `promo_codes` row → the pure rule. */
export function promoRuleFromRow(row: {
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
}): PromoCodeRule {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: num(row.value) ?? 0,
    minOrderMdl: num(row.minOrderMdl),
    validFrom: row.validFrom,
    validTo: row.validTo,
    maxUsesTotal: row.maxUsesTotal,
    maxUsesPerCustomer: row.maxUsesPerCustomer,
    categories: row.categories ?? [],
    products: row.products ?? [],
    active: row.active,
  };
}

/**
 * Where-clause of orders that "use" a code: paid ones (not trashed), plus
 * unpaid ones placed in the last {@link PROMO_PENDING_HOLD_MS} (held).
 * The paid part is also in `usesCount`; this one is used per customer.
 */
export function promoHoldingOrdersWhere(promoId: string, now: Date, email?: string | null): Prisma.OrderWhereInput {
  return {
    // Test-payment orders (closed test) and trashed ones never hold or use up a code.
    ...promoRealOrdersWhere(promoId),
    ...(email ? { customerEmail: email } : {}),
    OR: [
      { paymentStatus: "paid" },
      { paymentStatus: { not: "paid" }, createdAt: { gte: new Date(now.getTime() - PROMO_PENDING_HOLD_MS) } },
    ],
  };
}

/** Uses so far: `usesCount` (paid) + held unpaid orders; per customer from the orders of that e-mail. */
export async function loadPromoUses(
  promo: { id: string; usesCount: number; maxUsesTotal: number | null; maxUsesPerCustomer: number | null },
  now: Date,
  email?: string | null,
): Promise<{ total: number; customer: number }> {
  const pending: number =
    promo.maxUsesTotal != null
      ? await prisma.order.count({ where: promoHeldOrdersWhere(promo.id, now) })
      : 0;
  const customer: number =
    promo.maxUsesPerCustomer != null && email
      ? await prisma.order.count({ where: promoHoldingOrdersWhere(promo.id, now, email) })
      : 0;
  return { total: promo.usesCount + pending, customer };
}

export interface ApplyPromoInput {
  code: unknown;
  /** Priced lines: their quote (product / category are derived from it, never sent by the browser) and server total. */
  lines: readonly { quote: unknown; total: number }[];
  deliveryPrice: number;
  email?: string | null;
  now?: Date;
}

/** Load, check and price a promo code for a cart priced on the server. */
export async function applyShopPromo(input: ApplyPromoInput): Promise<PromoResult> {
  const code = normalizePromoCode(input.code);
  if (!code) return { ok: false, reason: "invalid" };
  const now: Date = input.now ?? new Date();
  const row = await prisma.promoCode.findUnique({ where: { code } });
  if (!row || !row.active) return { ok: false, reason: "invalid" };
  const rule = promoRuleFromRow(row);
  let lines: PromoCartLine[] = input.lines.map((l) => ({ total: l.total, slug: null, category: null }));
  if (promoHasRestrictions(rule)) {
    const resolve = await loadShopLineRefResolver();
    lines = input.lines.map((l) => {
      const ref = resolve(l.quote);
      return { total: l.total, slug: ref?.slug ?? null, category: ref?.category ?? null };
    });
  }
  const email: string | null = input.email ? input.email.trim().toLowerCase() : null;
  const uses = await loadPromoUses(row, now, email);
  return evaluatePromo(rule, { lines, deliveryPrice: input.deliveryPrice, email, now, uses });
}

/**
 * Count a paid order's promo use, once: inside the payment transaction, after
 * the order flipped to paid. No-op without a code or when already counted.
 */
export async function countPromoUseOnPaid(
  tx: Pick<Prisma.TransactionClient, "order" | "promoCode">,
  orderId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const o = await tx.order.findUnique({ where: { id: orderId }, select: { promoCodeId: true, promoCountedAt: true } });
  if (!o?.promoCodeId || o.promoCountedAt) return false;
  const marked = await tx.order.updateMany({
    where: { id: orderId, promoCountedAt: null },
    data: { promoCountedAt: now },
  });
  if (marked.count !== 1) return false;
  await tx.promoCode.update({ where: { id: o.promoCodeId }, data: { usesCount: { increment: 1 } } });
  return true;
}
