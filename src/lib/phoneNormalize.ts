/** Digits only, for matching client phones across formatting differences. */
export function normalizePhoneDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * The digits of a search query that looks like a phone number: after
 * removing spaces, `+`, `-`, `(`, `)` and `.` only digits are left, at least
 * 3 of them. Anything else (a name, «#10300» with its `#`, a file name) → null,
 * so text searches keep their plain behaviour.
 */
export function phoneQueryDigits(query: string): string | null {
  const compact = query.replace(/[\s+\-().]/g, "");
  return /^\d{3,}$/.test(compact) ? compact : null;
}

/**
 * Moldova local part: drops ONE leading `373` (country code) or `0` (trunk
 * prefix), so `37368900999`, `068900999` and `68900999` all become
 * `68900999`. Only one prefix is stripped: a test number like «000000001»
 * keeps its other zeros. Mirrors {@link PHONE_LOCAL_SQL_PREFIX}.
 */
export function stripMoldovaPrefix(digits: string): string {
  return digits.startsWith("373") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
}

/** Postgres regex that {@link stripMoldovaPrefix} applies (with `regexp_replace(…, '', '')`). */
export const PHONE_LOCAL_SQL_PREFIX = "^(373|0)";

/**
 * Digit forms of a phone-like search query to match a stored phone with its
 * non-digits removed (e.g. `StudioCustomer.phoneNormalized`, stored as typed:
 * `37369…`, `069…`, `69…`): the plain digits and the local part without one
 * leading `373` / `0` — so «069123456» finds «+37369123456» and the reverse.
 * Empty when the query is not phone-like (letters, fewer than 3 digits).
 */
export function phoneSearchDigitVariants(query: string): string[] {
  const digits = phoneQueryDigits(query);
  if (!digits) return [];
  const local = stripMoldovaPrefix(digits);
  return local.length >= 3 && local !== digits ? [digits, local] : [digits];
}
