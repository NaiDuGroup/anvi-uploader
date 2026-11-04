/**
 * Quantity field: what the visitor types is a draft (digits only, may be
 * empty) until the field loses focus or Enter is pressed; only then is it
 * clamped. Typing «5» into a cleared field gives 5, «-5» gives 5. Pure.
 */

/** Keep digits only (at most 6). */
export function sanitizeQtyDraft(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

/** A draft that is already a valid quantity (sent live while typing), else null. */
export function liveQty(draft: string, min: number, max: number): number | null {
  if (draft === "") return null;
  const n: number = Number.parseInt(draft, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Final value on blur / Enter: empty → `min`, otherwise clamped to `min..max`. */
export function commitQty(draft: string, min: number, max: number): number {
  const n: number = Number.parseInt(sanitizeQtyDraft(draft), 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
