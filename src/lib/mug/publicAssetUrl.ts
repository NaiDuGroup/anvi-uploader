/**
 * Browser-usable URL for an R2 key or passthrough http(s) URL.
 *
 * Routing rules:
 * - Absolute URLs → returned as-is.
 * - Catalog assets (`catalog/...`, `company/...`) live in the public catalog bucket:
 *   served directly from `R2_CATALOG_PUBLIC_URL` when configured, otherwise via
 *   the proxy fallback at `/api/public/file?bucket=catalog`.
 * - Legacy/order keys (anything else, typically `uploads/...`) fall back to the
 *   main bucket's `R2_PUBLIC_URL` or the proxy at `/api/public/file`.
 *
 * Called from server code (e.g. `toAdminMugProductJson.ts`, API route handlers);
 * resulting URL is serialised into the JSON payload sent to the client, so
 * non-`NEXT_PUBLIC_` env vars are fine here.
 */
export function publicAssetUrlFromStorageKey(key: string | null | undefined): string | null {
  if (key == null || key === "") return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;

  const normalised = key.replace(/^\//, "");

  if (normalised.startsWith("catalog/") || normalised.startsWith("company/")) {
    const catalogCdn = process.env.R2_CATALOG_PUBLIC_URL?.replace(/\/$/, "");
    if (catalogCdn) {
      return `${catalogCdn}/${normalised}`;
    }
    return `/api/public/file?key=${encodeURIComponent(normalised)}&bucket=catalog`;
  }

  const cdn = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (cdn) {
    return `${cdn}/${normalised}`;
  }
  return `/api/public/file?key=${encodeURIComponent(normalised)}`;
}
