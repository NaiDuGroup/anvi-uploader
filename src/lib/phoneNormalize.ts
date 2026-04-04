/** Digits only, for matching client phones across formatting differences. */
export function normalizePhoneDigits(input: string): string {
  return input.replace(/\D/g, "");
}
