/**
 * Order-file lifecycle helpers.
 *
 * Order files (everything uploaded via POST /api/upload-url with the default
 * `order` scope) land in the main R2 bucket under keys of the form
 * `uploads/<Date.now()>-<nanoid>-<originalName>` and are deleted by an R2
 * lifecycle rule after `ORDER_FILE_LIFECYCLE_DAYS` days.
 *
 * These helpers let the UI show a small "X days left" badge by parsing the
 * upload timestamp directly from the storage key — no extra R2 calls.
 *
 * If the R2 lifecycle rule is ever changed (e.g. 7 → 14 days), update
 * `ORDER_FILE_LIFECYCLE_DAYS` here; that is the single source of truth used
 * by all badge renderings.
 */
export const ORDER_FILE_LIFECYCLE_DAYS = 7;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Parses the upload timestamp from an order-file storage key.
 *
 * Returns `null` for:
 * - empty values
 * - absolute http(s) URLs (external links, e.g. Google Drive)
 * - non-`uploads/` keys (catalog photos, company logo)
 * - malformed keys without a 13-digit timestamp prefix
 */
export function parseOrderFileUploadedAt(fileUrl: string): Date | null {
  if (!fileUrl) return null;
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return null;
  const normalised = fileUrl.replace(/^\//, "");
  if (!normalised.startsWith("uploads/")) return null;
  const rest = normalised.slice("uploads/".length);
  const tsMatch = rest.match(/^(\d{13})-/);
  if (!tsMatch) return null;
  const ts = Number(tsMatch[1]);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts);
}

/** Convenience: upload time + lifecycle window. `null` mirrors `parseOrderFileUploadedAt`. */
export function parseOrderFileExpiryAt(fileUrl: string): Date | null {
  const uploadedAt = parseOrderFileUploadedAt(fileUrl);
  if (!uploadedAt) return null;
  return new Date(uploadedAt.getTime() + ORDER_FILE_LIFECYCLE_DAYS * ONE_DAY_MS);
}

export type LifecycleStatus =
  | { kind: "expired" }
  | { kind: "expiresToday" }
  | { kind: "daysLeft"; days: number };

/**
 * Maps a remaining-time delta to a discriminated status.
 *
 * Semantics use floor-of-full-days, so the badge shows the *guaranteed
 * minimum* days remaining (never lies optimistic).
 *
 * - past expiry → `expired`
 * - less than 24h left → `expiresToday`
 * - otherwise → `daysLeft` with `days = floor(hoursLeft / 24)` (>= 1)
 */
export function computeLifecycleStatus(expiry: Date, now: Date): LifecycleStatus {
  const msLeft = expiry.getTime() - now.getTime();
  if (msLeft <= 0) return { kind: "expired" };
  const hoursLeft = msLeft / ONE_HOUR_MS;
  if (hoursLeft < 24) return { kind: "expiresToday" };
  return { kind: "daysLeft", days: Math.floor(hoursLeft / 24) };
}
