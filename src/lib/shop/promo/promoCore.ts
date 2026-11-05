import { round2 } from "@/lib/money";
import { SHOP_MIN_PAYABLE_MDL } from "../constants";

/**
 * Storefront promo codes (Vistaprint-style), the pure part: code
 * normalisation, validation against the cart and the discount. The server
 * (`promoServer.ts`) loads the code and its uses; the browser never decides
 * a price. Client-safe (no Node / Prisma imports).
 *
 * Totals: `total = subtotal + delivery − discount`.
 * - percent / fixed: off the ELIGIBLE subtotal (lines in the code's
 *   categories or products; every line when the code lists none), never
 *   more than it;
 * - free_delivery: the discount is the delivery price (pickup has none →
 *   `not_applicable`).
 * The minimum order compares to the eligible subtotal («qualifying items»).
 *
 * Minimum payable: the discount is capped so the amount the gateway charges
 * (`subtotal + delivery − discount`) stays ≥ {@link SHOP_MIN_PAYABLE_MDL}
 * (`limited: true` when the cap cut it). An order at or under that amount
 * gets nothing (`min_payable`): a code never raises a price.
 */

export const PROMO_TYPES = ["percent", "fixed", "free_delivery"] as const;
export type PromoType = (typeof PROMO_TYPES)[number];

export const PROMO_CODE_MAX = 40;
const CODE_RE = /^[A-Z0-9_-]{1,40}$/;

/** «  summer10 » → «SUMMER10»; null when it can never be a code. */
export function normalizePromoCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** Why a code does not apply (shown to the customer, ro / ru / en). */
export type PromoRejectReason =
  /** Unknown or switched off — one answer for both (no code enumeration). */
  | "invalid"
  | "not_started"
  | "expired"
  | "min_total"
  | "limit_reached"
  | "customer_limit"
  | "email_required"
  | "not_applicable"
  /** The order already costs {@link SHOP_MIN_PAYABLE_MDL} or less: nothing left to take off. */
  | "min_payable";

export const PROMO_REJECT_REASONS: readonly PromoRejectReason[] = [
  "invalid",
  "not_started",
  "expired",
  "min_total",
  "limit_reached",
  "customer_limit",
  "email_required",
  "not_applicable",
  "min_payable",
];

/** A promo code as the server loaded it (Decimal columns already numbers). */
export interface PromoCodeRule {
  id: string;
  code: string;
  type: PromoType | string;
  /** Percent (1–100) or MDL. */
  value: number;
  minOrderMdl: number | null;
  validFrom: Date | null;
  /** Inclusive last instant (the admin's «до» day → 23:59:59.999 in Chișinău). */
  validTo: Date | null;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number | null;
  categories: readonly string[];
  products: readonly string[];
  active: boolean;
}

/** One priced cart line: its server total and its product / category (from its quote). */
export interface PromoCartLine {
  total: number;
  slug: string | null;
  category: string | null;
}

export interface PromoUses {
  /** Paid uses (`usesCount`) + recent unpaid orders holding the code. */
  total: number;
  /** Same, for the checkout e-mail. */
  customer: number;
}

export interface PromoCartInput {
  lines: readonly PromoCartLine[];
  deliveryPrice: number;
  /** Checkout e-mail (lower-case), when given. */
  email?: string | null;
  now: Date;
  uses: PromoUses;
}

export interface PromoApplied {
  ok: true;
  promoId: string;
  code: string;
  type: PromoType;
  value: number;
  discount: number;
  subtotal: number;
  eligibleSubtotal: number;
  deliveryPrice: number;
  total: number;
  /** The discount was cut to keep the minimum payable ({@link SHOP_MIN_PAYABLE_MDL}). */
  limited: boolean;
  /** `limited`: what the code would have given without the cap. */
  uncappedDiscount?: number;
}

export interface PromoRejected {
  ok: false;
  reason: PromoRejectReason;
  /** `min_total`: the eligible amount needed; `min_payable`: the minimum payable. */
  minOrderMdl?: number;
}

export type PromoResult = PromoApplied | PromoRejected;

export function isPromoType(v: unknown): v is PromoType {
  return typeof v === "string" && (PROMO_TYPES as readonly string[]).includes(v);
}

/** A line counts for the code: no restriction, or its category OR its product is listed. */
export function promoLineEligible(rule: Pick<PromoCodeRule, "categories" | "products">, line: PromoCartLine): boolean {
  if (rule.categories.length === 0 && rule.products.length === 0) return true;
  if (line.category && rule.categories.includes(line.category)) return true;
  return line.slug != null && rule.products.includes(line.slug);
}

/** Whether the code needs to know each line's product / category. */
export function promoHasRestrictions(rule: Pick<PromoCodeRule, "categories" | "products">): boolean {
  return rule.categories.length > 0 || rule.products.length > 0;
}

/** The discount in MDL (0 when nothing to take off). */
export function promoDiscount(type: PromoType, value: number, eligibleSubtotal: number, deliveryPrice: number): number {
  if (type === "free_delivery") return round2(Math.max(0, deliveryPrice));
  if (type === "percent") {
    const pct: number = Math.min(100, Math.max(0, value));
    return round2(Math.min(eligibleSubtotal, (eligibleSubtotal * pct) / 100));
  }
  return round2(Math.min(eligibleSubtotal, Math.max(0, value)));
}

/**
 * Cap a discount so `subtotal + delivery − discount` stays ≥ `minPayable`
 * (never below 0, never above the discount itself).
 */
export function capPromoDiscount(
  discount: number,
  subtotal: number,
  deliveryPrice: number,
  minPayable: number = SHOP_MIN_PAYABLE_MDL,
): { discount: number; limited: boolean } {
  const room: number = Math.max(0, round2(subtotal + deliveryPrice - minPayable));
  const d: number = round2(Math.max(0, discount));
  return d > room ? { discount: room, limited: true } : { discount: d, limited: false };
}

/** Check a loaded code against the cart and price it. `rule` null = unknown code. */
export function evaluatePromo(rule: PromoCodeRule | null, cart: PromoCartInput): PromoResult {
  if (!rule || !rule.active || !isPromoType(rule.type)) return { ok: false, reason: "invalid" };
  const now: number = cart.now.getTime();
  if (rule.validFrom && now < rule.validFrom.getTime()) return { ok: false, reason: "not_started" };
  if (rule.validTo && now > rule.validTo.getTime()) return { ok: false, reason: "expired" };
  if (rule.maxUsesTotal != null && cart.uses.total >= rule.maxUsesTotal) return { ok: false, reason: "limit_reached" };
  if (rule.maxUsesPerCustomer != null) {
    if (!cart.email) return { ok: false, reason: "email_required" };
    if (cart.uses.customer >= rule.maxUsesPerCustomer) return { ok: false, reason: "customer_limit" };
  }
  const subtotal: number = round2(cart.lines.reduce((s, l) => s + l.total, 0));
  const eligible: PromoCartLine[] = cart.lines.filter((l) => promoLineEligible(rule, l));
  if (eligible.length === 0) return { ok: false, reason: "not_applicable" };
  const eligibleSubtotal: number = round2(eligible.reduce((s, l) => s + l.total, 0));
  if (rule.minOrderMdl != null && eligibleSubtotal < rule.minOrderMdl) {
    return { ok: false, reason: "min_total", minOrderMdl: rule.minOrderMdl };
  }
  const deliveryPrice: number = round2(cart.deliveryPrice);
  if (rule.type === "free_delivery" && deliveryPrice <= 0) return { ok: false, reason: "not_applicable" };
  const uncapped: number = promoDiscount(rule.type, rule.value, eligibleSubtotal, deliveryPrice);
  if (uncapped <= 0) return { ok: false, reason: "not_applicable" };
  const { discount, limited } = capPromoDiscount(uncapped, subtotal, deliveryPrice);
  if (discount <= 0) return { ok: false, reason: "min_payable", minOrderMdl: SHOP_MIN_PAYABLE_MDL };
  return {
    ok: true,
    promoId: rule.id,
    code: rule.code,
    type: rule.type,
    value: rule.value,
    discount,
    subtotal,
    eligibleSubtotal,
    deliveryPrice,
    total: round2(subtotal + deliveryPrice - discount),
    limited,
    ...(limited ? { uncappedDiscount: uncapped } : {}),
  };
}

/** `Order.promoData` snapshot. */
export function promoSnapshot(p: PromoApplied): Record<string, string | number> {
  return {
    type: p.type,
    value: p.value,
    discount: p.discount,
    subtotal: p.subtotal,
    eligibleSubtotal: p.eligibleSubtotal,
    deliveryPrice: p.deliveryPrice,
    ...(p.limited ? { limited: 1, uncappedDiscount: p.uncappedDiscount ?? p.discount } : {}),
  };
}

function mdl(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Staff note line, Russian: «Промокод SUMMER10 (−10%): −50 MDL» / «Промокод SHIP (бесплатная доставка): −45 MDL». */
export function promoStaffNoteRu(p: Pick<PromoApplied, "code" | "type" | "value" | "discount"> & { limited?: boolean }): string {
  const what: string =
    p.type === "percent" ? `−${mdl(p.value)}%` : p.type === "free_delivery" ? "бесплатная доставка" : `−${mdl(p.value)} MDL`;
  const cap: string = p.limited ? ` (ограничено: мин. к оплате ${mdl(SHOP_MIN_PAYABLE_MDL)} MDL)` : "";
  return `Промокод ${p.code} (${what}): −${mdl(p.discount)} MDL${cap}`;
}
