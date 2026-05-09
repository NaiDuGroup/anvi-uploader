/**
 * Browser-usable URL for an R2 key or passthrough http(s) URL.
 * In dev without `R2_PUBLIC_URL`, uses unauthenticated `/api/public/file`.
 */
export function publicAssetUrlFromStorageKey(key: string | null | undefined): string | null {
  if (key == null || key === "") return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  const cdn = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (cdn) {
    return `${cdn}/${key.replace(/^\//, "")}`;
  }
  return `/api/public/file?key=${encodeURIComponent(key)}`;
}
