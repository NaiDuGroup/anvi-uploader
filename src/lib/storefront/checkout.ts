import { checkoutLine, type CartLine } from "./cart";
import type { ShopLang } from "./i18n";

/**
 * Checkout form → `POST /api/shop/checkout` body, client-side validation and
 * the readable outcome of the answer. Pure (unit-tested).
 */

export const DELIVERY_METHODS = ["pickup", "courier_chisinau", "courier_moldova"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

/** Display prices only — the server decides the delivery price. */
export const DELIVERY_DISPLAY_PRICE: Record<DeliveryMethod, number> = {
  pickup: 0,
  courier_chisinau: 45,
  courier_moldova: 60,
};

export interface CheckoutForm {
  name: string;
  phone: string;
  email: string;
  method: DeliveryMethod;
  city: string;
  address: string;
  note: string;
  acceptTerms: boolean;
}

export type CheckoutField = "name" | "phone" | "email" | "city" | "address" | "terms";

export function validateCheckout(form: CheckoutForm): Partial<Record<CheckoutField, true>> {
  const errors: Partial<Record<CheckoutField, true>> = {};
  if (form.name.trim().length < 2) errors.name = true;
  const digits: string = form.phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) errors.phone = true;
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = true;
  if (form.method !== "pickup") {
    if (form.method === "courier_moldova" && form.city.trim().length < 2) errors.city = true;
    if (form.address.trim().length < 3) errors.address = true;
  }
  if (!form.acceptTerms) errors.terms = true;
  return errors;
}

export function buildCheckoutBody(form: CheckoutForm, lines: readonly CartLine[], lang: ShopLang) {
  const courier: boolean = form.method !== "pickup";
  const city: string = form.method === "courier_chisinau" ? form.city.trim() || "Chișinău" : form.city.trim();
  return {
    locale: lang,
    customer: {
      name: form.name.trim(),
      phone: form.phone.trim(),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
    },
    delivery: {
      method: form.method,
      ...(courier && city ? { city } : {}),
      ...(courier && form.address.trim() ? { address: form.address.trim() } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    },
    lines: lines.map(checkoutLine),
    acceptTerms: true as const,
  };
}

export interface CheckoutCreated {
  orderId: string;
  orderNumber: string | number;
  publicToken: string;
  total: number;
  deliveryPrice: number;
  subtotal: number;
  payment: { provider: string; redirectUrl: string | null };
}

export type CheckoutOutcome =
  | { kind: "redirect"; created: CheckoutCreated; url: string }
  | { kind: "payment_soon"; orderNumber: string; token: string }
  | { kind: "line_unavailable"; index: number | null }
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "server" };

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** HTTP status + JSON body of the checkout → what the page shows. */
export function checkoutOutcome(status: number, body: unknown): CheckoutOutcome {
  const b: Record<string, unknown> = isObj(body) ? body : {};
  if ((status === 201 || status === 200) && typeof b.publicToken === "string") {
    const created = b as unknown as CheckoutCreated;
    const url: unknown = isObj(b.payment) ? b.payment.redirectUrl : null;
    if (typeof url === "string" && url) return { kind: "redirect", created, url };
    return { kind: "payment_soon", orderNumber: String(created.orderNumber ?? ""), token: created.publicToken };
  }
  if (status === 503 && b.error === "payment_not_configured") {
    const token: unknown = b.publicToken ?? (isObj(b.order) ? b.order.publicToken : undefined);
    const number: unknown = b.orderNumber ?? (isObj(b.order) ? b.order.orderNumber : undefined);
    if (typeof token === "string") return { kind: "payment_soon", orderNumber: String(number ?? ""), token };
    return { kind: "server" };
  }
  if (status === 422 && b.error === "line_unavailable") {
    return { kind: "line_unavailable", index: typeof b.index === "number" ? b.index : null };
  }
  if (status === 422 || status === 400) return { kind: "invalid" };
  if (status === 429) return { kind: "rate_limited" };
  return { kind: "server" };
}
