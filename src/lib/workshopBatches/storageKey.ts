/**
 * Build an object-storage key for a saved workshop-batch layout.
 *
 * Key shape mirrors the existing order-file convention (`uploads/<ts>-<nano>-<name>`)
 * so that the same R2 7-day lifecycle rule (prefix `uploads/`) sweeps the
 * objects. We nest under `uploads/workshop-batches/` for humans browsing the
 * bucket, but the timestamp prefix guarantees uniqueness even without the sub-
 * prefix.
 */

const MAX_NAME_LEN = 120;

/**
 * Strip anything that isn't safe as an S3 key segment (Unicode letters/numbers,
 * dot, dash, underscore) so the resulting URL/key never needs percent-encoding
 * for browsers or the S3 SDK. Collapses runs of dashes and trims leading /
 * trailing separators. Truncated to {@link MAX_NAME_LEN} to keep the key well
 * under S3's 1024-byte hard limit.
 */
export function sanitizeBatchFileName(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, MAX_NAME_LEN);
  return cleaned.length > 0 ? cleaned : "batch.png";
}

export function buildBatchStorageKey(params: {
  timestampMs: number;
  nanoid: string;
  fileName: string;
}): string {
  const { timestampMs, nanoid, fileName } = params;
  const safeName = sanitizeBatchFileName(fileName);
  return `uploads/workshop-batches/${timestampMs}-${nanoid}-${safeName}`;
}

/** True for keys that our tools have produced. */
export function isWorkshopBatchKey(key: string): boolean {
  return key.startsWith("uploads/workshop-batches/");
}
