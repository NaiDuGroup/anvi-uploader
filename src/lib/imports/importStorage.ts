import { nanoid } from "nanoid";
import { getPresignedDownloadUrl, getPresignedUploadUrl, isLocalObjectStorage, putObjectBuffer } from "@/lib/r2";
import { readLocalFile, saveLocalFile } from "@/lib/local-storage";
import { GOR_FACTORY_IMAGE_HOST } from "./gorFactory";

/**
 * Import documents live in the main («uploads») bucket under `imports/<id>/` —
 * not `uploads/`, which the bucket lifecycle rule empties after 7 days.
 */
export function importDocumentKey(importId: string, fileName: string): string {
  const safe: string = fileName.replace(/[^\p{L}\p{N}._ -]+/gu, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
  return `imports/${importId}/${Date.now()}-${nanoid(6)}-${safe}`;
}

export function isImportDocumentKey(importId: string, key: string): boolean {
  return key.startsWith(`imports/${importId}/`) && !key.includes("..");
}

/** URL the browser PUTs the file to (local dev: the app's own `/api/upload-url`). */
export async function importUploadUrl(key: string, contentType: string, origin: string): Promise<string> {
  if (isLocalObjectStorage()) return `${origin}/api/upload-url?key=${encodeURIComponent(key)}`;
  return getPresignedUploadUrl(key, contentType || "application/octet-stream", "uploads");
}

export async function readImportDocument(key: string): Promise<Buffer | null> {
  if (isLocalObjectStorage()) return readLocalFile(key);
  const res = await fetch(await getPresignedDownloadUrl(key, "uploads"));
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** Copy a supplier photo into the catalog bucket; returns its key, or null when it cannot be fetched. */
export async function copySupplierPhotoToCatalog(url: string, code: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== GOR_FACTORY_IMAGE_HOST) return null;
  const res = await fetch(parsed, { signal: AbortSignal.timeout(15_000) });
  const type: string = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > 10 * 1024 * 1024) return null;
  const ext: string = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const key = `catalog/stock/${Date.now()}-${code.replace(/[^A-Za-z0-9_-]/g, "")}.${ext}`;
  if (isLocalObjectStorage()) await saveLocalFile(key, buf);
  else await putObjectBuffer(key, buf, type, { kind: "catalog" });
  return key;
}
