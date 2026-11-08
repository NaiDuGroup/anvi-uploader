import "server-only";
import { deleteLocalFile, readLocalFile, saveLocalFile, statLocalFile } from "@/lib/local-storage";
import { copyObject, deleteObjects, getObjectMeta, isLocalObjectStorage } from "@/lib/r2";
import { isLibraryKey } from "./libraryKeys";

/**
 * Storage side of «Библиотека макетов», in both modes: `.local-uploads/` in
 * local dev (`R2_ACCOUNT_ID=local-dev`) and the R2 uploads bucket otherwise.
 *
 * ⚠ Relies on the bucket's lifecycle rule being scoped to the `uploads/`
 * prefix (like `shop-orders/`, see `shopFiles.ts`). If the rule ever covers
 * the whole bucket, library copies would expire too.
 */

/** Size of a stored object, or null when it is gone (lifecycle-expired / deleted). */
export async function storedObjectSize(key: string): Promise<number | null> {
  if (isLocalObjectStorage()) return (await statLocalFile(key))?.size ?? null;
  return (await getObjectMeta(key))?.size ?? null;
}

/** Server-side copy; never touches the source. False when the source does not exist. */
export async function copyStoredObject(sourceKey: string, destKey: string): Promise<boolean> {
  if (isLocalObjectStorage()) {
    const data = await readLocalFile(sourceKey);
    if (!data) return false;
    await saveLocalFile(destKey, data);
    return true;
  }
  return copyObject(sourceKey, destKey);
}

/** Delete one library copy. Refuses any key outside `library/`. */
export async function deleteLibraryObject(key: string): Promise<void> {
  if (!isLibraryKey(key)) throw new Error("Refusing to delete a non-library key");
  if (isLocalObjectStorage()) {
    await deleteLocalFile(key);
    return;
  }
  await deleteObjects([key]);
}
