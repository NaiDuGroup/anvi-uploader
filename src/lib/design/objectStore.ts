import "server-only";
import {
  getPresignedDownloadUrl,
  isLocalObjectStorage,
  putObjectBuffer,
  type BucketKind,
} from "@/lib/r2";
import { readLocalFile, saveLocalFile } from "@/lib/local-storage";

/**
 * Server-side object read/write that transparently works in both storage
 * modes: `.local-uploads/` in local dev (`R2_ACCOUNT_ID=local-dev`) and
 * R2/S3 otherwise. Used by Design Studio routes that post-process uploads
 * (thumbnail generation).
 */

export async function readObjectBytes(
  key: string,
  bucket: BucketKind,
): Promise<Buffer | null> {
  if (isLocalObjectStorage()) {
    return readLocalFile(key);
  }
  const url = await getPresignedDownloadUrl(key, bucket);
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function writeObjectBytes(
  key: string,
  data: Buffer | Uint8Array,
  contentType: string,
  bucket: BucketKind,
): Promise<void> {
  if (isLocalObjectStorage()) {
    await saveLocalFile(key, Buffer.from(data));
    return;
  }
  await putObjectBuffer(key, data, contentType, { kind: bucket });
}
