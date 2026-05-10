/**
 * Shared upload helpers used by the admin order wizard and edit modal.
 *
 *  - `uploadFile`            — direct PUT to R2 via signed URL.
 *  - `uploadPhotoUrl`        — uploads a `blob:` photo (or returns the
 *                              already-stored R2 key when the URL is already
 *                              an admin-served file).
 *  - `ADMIN_FILE_PREFIX` /
 *    `resolveR2Key`          — keep all admin code converting between R2 keys
 *                              and admin-protected URLs in one place.
 */

export const ADMIN_FILE_PREFIX = "/api/admin/file-by-key?key=";

export function resolveR2Key(key: string): string {
  if (key.startsWith("blob:") || key.startsWith("http") || key.startsWith("/")) {
    return key;
  }
  return `${ADMIN_FILE_PREFIX}${encodeURIComponent(key)}`;
}

export function extractR2Key(url: string): string | null {
  if (url.startsWith(ADMIN_FILE_PREFIX)) {
    return decodeURIComponent(url.slice(ADMIN_FILE_PREFIX.length));
  }
  return null;
}

export interface UploadResult {
  fileName: string;
  /** The R2 key (NOT a public URL). Stored as `Order.files[].fileUrl`. */
  fileUrl: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
    }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  const { uploadUrl, fileKey } = (await res.json()) as {
    uploadUrl: string;
    fileKey: string;
  };

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!uploadRes.ok) throw new Error("Failed to upload file");

  return { fileName: file.name, fileUrl: fileKey };
}

/**
 * Either re-uses an existing R2 key (when the URL is already admin-served),
 * uploads a `blob:` URL, or passes through an external URL untouched.
 */
export async function uploadPhotoUrl(url: string): Promise<string> {
  const existingKey = extractR2Key(url);
  if (existingKey) return existingKey;
  if (!url.startsWith("blob:")) return url;
  const resp = await fetch(url);
  const blob = await resp.blob();
  const file = new File(
    [blob],
    `photo-${Date.now()}.jpg`,
    { type: blob.type || "image/jpeg" },
  );
  const { fileUrl } = await uploadFile(file);
  return fileUrl;
}
