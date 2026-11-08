import "server-only";
import { prisma } from "@/lib/prisma";
import { deleteLocalFile } from "@/lib/local-storage";
import { deleteObjects, isLocalObjectStorage } from "@/lib/r2";
import { DESIGN_RENDER_PREFIX } from "./renderCleanup";

/**
 * Delete superseded `designs/` render objects that no design and no order
 * file still references. Best effort: a failure only leaves an orphan.
 */
export async function deleteUnusedDesignRenders(keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    if (!key.startsWith(DESIGN_RENDER_PREFIX)) continue;
    try {
      const [designs, files] = await Promise.all([
        prisma.design.count({ where: { OR: [{ renderKey: key }, { thumbKey: key }] } }),
        prisma.file.count({ where: { fileUrl: key } }),
      ]);
      if (designs > 0 || files > 0) continue;
      if (isLocalObjectStorage()) await deleteLocalFile(key);
      else await deleteObjects([key]);
    } catch (error) {
      console.error("design render cleanup failed:", key, error);
    }
  }
}
