/** Digits only, for matching client phones across formatting differences. */
export function normalizePhoneDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Digit forms of a client search query to match `StudioCustomer.phoneNormalized`
 * (digits only, stored as typed: `37369…`, `069…`, `69…`): the plain digits
 * and the local part without ONE leading `373` / `0` — so «069123456» finds
 * «+37369123456» and the reverse. Only one prefix is stripped: a test number
 * like «000000001» keeps its other zeros. Empty below 3 digits.
 */
export function phoneSearchDigitVariants(query: string): string[] {
  const digits = normalizePhoneDigits(query);
  if (digits.length < 3) return [];
  const local = digits.startsWith("373") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  return local.length >= 3 && local !== digits ? [digits, local] : [digits];
}
