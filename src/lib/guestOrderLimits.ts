/**
 * Limits of a guest `POST /api/orders` (no staff / cabinet session), shared by
 * the server check (`guestOrderFieldIssues` in `validations.ts`) and the guest
 * forms (`/`, `/mug`, `/notebook`, `/pen`). Dependency-free so the forms can
 * import it without pulling in the schemas.
 */

/** Paper copies per file. */
export const GUEST_MAX_COPIES = 10_000;
/** Mug / notebook / pen pieces per guest order (every piece is taken from stock). */
export const GUEST_PRODUCT_MAX_QUANTITY = 1_000;
export const ORDER_PHONE_MAX_LENGTH = 32;

/** Copies text field while typing: digits only, at most `max` (empty stays empty). */
export function clampCopiesInput(raw: string, max: number): string {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits === "") return "";
  return parseInt(digits, 10) > max ? String(max) : digits;
}

/**
 * Guest phone: at most 32 characters with 8–15 digits. Other characters are
 * not rejected — walk-ins type «079 545 631», «+373 (79) 545-631», paste
 * numbers with invisible direction marks or add a name («0681 66 859 inna»).
 */
export function isValidOrderPhone(raw: string): boolean {
  const phone = raw.trim();
  if (phone.length === 0 || phone.length > ORDER_PHONE_MAX_LENGTH) return false;
  const digits = phone.replace(/\D/g, "").length;
  return digits >= 8 && digits <= 15;
}
