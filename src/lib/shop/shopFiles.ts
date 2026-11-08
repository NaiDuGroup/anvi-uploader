import "server-only";
import { deleteLocalFile, readLocalFile, saveLocalFile } from "@/lib/local-storage";
import { copyObject, deleteObjects, getObjectBytesIfSmall, isLocalObjectStorage } from "@/lib/r2";
import { isShopOrderFileKey, shopOrderFileKey } from "./orderRules";

/**
 * Storefront order files: copied from `uploads/` (deleted by the R2 lifecycle
 * rule after 7 days) to `shop-orders/` (no lifecycle rule) at checkout, so a
 * paid order that waits for production or courier keeps its artwork.
 * Released by `GET /api/cron/shop-order-files` (see `shopOrderFilesReleasable`).
 *
 * ⚠ Relies on the bucket's lifecycle rule being scoped to the `uploads/`
 * prefix. If the rule covers the whole bucket, these copies expire too.
 */

/** Copy one upload; returns the new key, or null when the upload does not exist. */
export async function copyUploadToShopOrders(uploadKey: string): Promise<string | null> {
  const dest = shopOrderFileKey(uploadKey);
  if (isLocalObjectStorage()) {
    const data = await readLocalFile(uploadKey);
    if (!data) return null;
    await saveLocalFile(dest, data);
    return dest;
  }
  return (await copyObject(uploadKey, dest)) ? dest : null;
}

/** Deletes storefront copies only: any key outside `shop-orders/` (e.g. `library/`) is skipped. */
export async function deleteShopOrderFiles(input: readonly string[]): Promise<void> {
  const keys = input.filter(isShopOrderFileKey);
  if (keys.length === 0) return;
  if (isLocalObjectStorage()) {
    await Promise.all(keys.map((k) => deleteLocalFile(k)));
    return;
  }
  for (let i = 0; i < keys.length; i += 1000) {
    await deleteObjects(keys.slice(i, i + 1000));
  }
}

/**
 * A stored order file for reading its pages (`printPageCheck.ts`): the bytes
 * when at most `maxBytes`, `{ tooBig }` without downloading it, null when missing.
 */
export async function readShopFileIfSmall(
  key: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array } | { tooBig: true } | null> {
  if (isLocalObjectStorage()) {
    const data = await readLocalFile(key);
    if (!data) return null;
    return data.byteLength > maxBytes ? { tooBig: true } : { bytes: data };
  }
  const got = await getObjectBytesIfSmall(key, maxBytes);
  if (!got) return null;
  return "tooBig" in got ? { tooBig: true } : { bytes: got.bytes };
}
