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

/**
 * Checkout prefill for a signed-in account: its saved details first; a field
 * the account leaves empty comes from this browser's draft. The e-mail is
 * always the account's.
 */
export function mergeAccountDraft(account: CheckoutDraft, draft: CheckoutDraft | null): CheckoutDraft {
  const d = draft ?? EMPTY_CHECKOUT_DRAFT;
  const pick = (a: string, b: string): string => (a.trim() ? a : b);
  const accountPhone: boolean = account.phone.replace(/\D/g, "").length > 3;
  return {
    name: pick(account.name, d.name),
    phone: accountPhone ? account.phone : d.phone,
    email: account.email,
    method: account.city.trim() || account.address.trim() || account.method !== "pickup" ? account.method : d.method,
    city: pick(account.city, d.city),
    address: pick(account.address, d.address),
    note: pick(account.note, d.note),
  };
}

/** A storefront account → checkout draft fields (unknown delivery shapes ignored). */
export function accountCheckoutDraft(a: { email: string; name: string | null; phone: string | null; delivery: unknown }): CheckoutDraft {
  const dv = a.delivery != null && typeof a.delivery === "object" && !Array.isArray(a.delivery) ? (a.delivery as Record<string, unknown>) : {};
  const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
  const method = typeof dv.method === "string" && (DELIVERY_METHODS as readonly string[]).includes(dv.method) ? (dv.method as DeliveryMethod) : "pickup";
  return {
    name: (a.name ?? "").slice(0, 100),
    phone: a.phone ?? EMPTY_CHECKOUT_DRAFT.phone,
    email: a.email,
    method,
    city: str(dv.city, 100),
    address: str(dv.address, 300),
    note: str(dv.note, 500),
  };
}
