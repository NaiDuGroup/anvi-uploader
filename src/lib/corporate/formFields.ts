import type { CorporateFieldErrors } from "./requestRules";

/**
 * «Pentru companii» form: the fields in the order they appear on the page,
 * so a failed submit can scroll to and focus the first wrong one. Pure
 * (client-safe).
 */
export const CORPORATE_FORM_FIELD_ORDER = [
  "companyName",
  "contactName",
  "phone",
  "email",
  "products",
  "productsOther",
  "quantity",
  "deadline",
  "budget",
  "hasLogo",
  "files",
  "message",
  "consent",
] as const;

export type CorporateFormField = (typeof CORPORATE_FORM_FIELD_ORDER)[number];

export type CorporateFormErrors = CorporateFieldErrors & { hasLogo?: string };

/** The first field (page order) with an error; unknown keys (e.g. `lang` from the server) come last, null when none. */
export function firstCorporateErrorField(errors: Readonly<Record<string, string | undefined>>): string | null {
  for (const f of CORPORATE_FORM_FIELD_ORDER) if (errors[f]) return f;
  return Object.keys(errors).find((k) => errors[k]) ?? null;
}

/** The errors without `field` (same object when it had none, so React skips the re-render). */
export function clearCorporateFieldError<E extends Readonly<Record<string, string | undefined>>>(errors: E, field: string): E {
  if (!(field in errors)) return errors;
  const next = { ...errors };
  delete (next as Record<string, unknown>)[field];
  return next;
}
