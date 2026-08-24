/**
 * Resolve an R2 object key referenced by a design element into a URL the
 * admin browser can load. Clipart lives in the public catalog bucket; ad-hoc
 * photo uploads live in the private uploads bucket and go through the
 * admin-only proxy route.
 */
export function resolveDesignFileUrl(fileKey: string): string {
  if (
    fileKey.startsWith("blob:") ||
    fileKey.startsWith("http") ||
    fileKey.startsWith("/")
  ) {
    return fileKey;
  }
  if (fileKey.startsWith("catalog/")) {
    return `/api/public/file?key=${encodeURIComponent(fileKey)}&bucket=catalog`;
  }
  return `/api/admin/file-by-key?key=${encodeURIComponent(fileKey)}`;
}
