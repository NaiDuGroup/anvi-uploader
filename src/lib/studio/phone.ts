/**
 * Phone numbers as printed on business cards and flyers. A Moldovan number
 * typed the local way («069123456», «022 123 456») or already international
 * («+37369123456», «373 69-123-456», «00373…») is drawn in the
 * international style «+373 69 123 456»; anything else (a foreign number, a
 * short number, two numbers, text) stays exactly as typed. The customer's
 * input keeps what they typed — only what is drawn is formatted. Pure.
 */

/** The 8 national digits of a Moldovan number (no leading 0 / 373), else null. */
function moldovaDigits(raw: string): string | null {
  const s: string = raw.trim();
  // Digits with the usual separators only (a «+» only in front).
  if (!/^\+?[\d\s\-().]+$/.test(s)) return null;
  const d: string = s.replace(/\D/g, "");
  let n: string | null = null;
  if (s.startsWith("+")) n = d.length === 11 && d.startsWith("373") ? d.slice(3) : null;
  else if (d.length === 9 && d.startsWith("0")) n = d.slice(1);
  else if (d.length === 11 && d.startsWith("373")) n = d.slice(3);
  else if (d.length === 13 && d.startsWith("00373")) n = d.slice(5);
  // A national number never starts with 0 after the prefix.
  return n && n.length === 8 && n[0] !== "0" ? n : null;
}

/** «069123456» → «+373 69 123 456»; not a Moldovan number → as typed. */
export function formatPhoneForPrint(raw: string): string {
  const n: string | null = moldovaDigits(raw);
  return n ? `+373 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}` : raw;
}

/** E.164 of a Moldovan number («+37369123456»), else null. */
export function moldovaPhoneE164(raw: string): string | null {
  const n: string | null = moldovaDigits(raw);
  return n ? `+373${n}` : null;
}
