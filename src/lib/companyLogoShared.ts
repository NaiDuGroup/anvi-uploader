/** Browser-safe helpers for company logo URL and validation (no Node / S3 imports). */

export const PUBLIC_COMPANY_LOGO_API_PATH = "/api/public/company-logo";

const COMPANY_LOGO_KEY_PREFIX = "company/logo/";

export function isAllowedCompanyLogoStorageKey(key: string): boolean {
  if (!key || key.includes("..") || key.includes("\\")) return false;
  return key.startsWith(COMPANY_LOGO_KEY_PREFIX);
}

/**
 * Superadmin may set: HTTPS URL, site path (`/logo.png`), or an uploaded object key (`company/logo/...`).
 */
export function isValidPersistedLogoPath(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const v = value.trim();
  if (!v) return true;
  if (v.includes("..")) return false;
  if (v.startsWith("http://") || v.startsWith("https://")) return true;
  if (v.startsWith("/")) return true;
  return isAllowedCompanyLogoStorageKey(v);
}

export function resolveCompanyLogoImgSrc(
  logoPath: string | null | undefined,
): string | null {
  const raw = logoPath?.trim();
  if (!raw) return null;
  if (raw.startsWith("https://") || raw.startsWith("http://")) return raw;
  if (raw.startsWith("/")) return raw;
  return PUBLIC_COMPANY_LOGO_API_PATH;
}
