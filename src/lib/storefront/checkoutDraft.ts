import { DELIVERY_METHODS, type CheckoutForm, type DeliveryMethod } from "./checkout";

/**
 * The checkout contact / delivery draft kept in this browser (`localStorage`),
 * so going back to the cart — or the next order — does not ask for the same
 * details again. Only these fields are stored: never the terms checkbox,
 * the cart or anything else. «Nu sunt eu» clears it.
 */

export const CHECKOUT_DRAFT_KEY = "anvi_shop_checkout_draft_v1";

export type CheckoutDraft = Pick<CheckoutForm, "name" | "phone" | "email" | "method" | "city" | "address" | "note">;

const LIMITS: Record<Exclude<keyof CheckoutDraft, "method">, number> = {
  name: 100,
  phone: 30,
  email: 200,
  city: 100,
  address: 300,
  note: 500,
};

export const EMPTY_CHECKOUT_DRAFT: CheckoutDraft = {
  name: "",
  phone: "+373 ",
  email: "",
  method: "pickup",
  city: "",
  address: "",
  note: "",
};

/** Stored JSON → a draft (unknown keys dropped, strings capped), or null when there is nothing usable. */
export function parseCheckoutDraft(raw: string | null | undefined): CheckoutDraft | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data == null || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const draft: CheckoutDraft = { ...EMPTY_CHECKOUT_DRAFT };
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const v: unknown = d[k];
    if (typeof v === "string") draft[k] = v.slice(0, LIMITS[k]);
  }
  if (typeof d.method === "string" && (DELIVERY_METHODS as readonly string[]).includes(d.method)) {
    draft.method = d.method as DeliveryMethod;
  }
  return hasDraftData(draft) ? draft : null;
}

/** Exactly the draft fields of the form (the terms checkbox is never kept). */
export function draftFromForm(form: CheckoutForm): CheckoutDraft {
  return {
    name: form.name,
    phone: form.phone,
    email: form.email,
    method: form.method,
    city: form.city,
    address: form.address,
    note: form.note,
  };
}

/** Anything typed beyond the defaults. */
export function hasDraftData(d: CheckoutDraft): boolean {
  return Boolean(
    d.name.trim() || d.phone.replace(/\D/g, "").length > 3 || d.email.trim() || d.city.trim() || d.address.trim() || d.note.trim(),
  );
}

export function loadCheckoutDraft(): CheckoutDraft | null {
  try {
    return parseCheckoutDraft(window.localStorage.getItem(CHECKOUT_DRAFT_KEY));
  } catch {
    return null;
  }
}

export function saveCheckoutDraft(form: CheckoutForm) {
  try {
    const draft = draftFromForm(form);
    if (hasDraftData(draft)) window.localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(CHECKOUT_DRAFT_KEY);
  } catch {
    /* private mode / full storage: the form still works */
  }
}

export function clearCheckoutDraft() {
  try {
    window.localStorage.removeItem(CHECKOUT_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
