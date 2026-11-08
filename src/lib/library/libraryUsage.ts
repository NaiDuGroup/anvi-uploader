import type { Prisma } from "@prisma/client";
import { libraryKeysOf } from "./libraryKeys";

/** The slice of a Prisma (transaction) client the use counter needs. */
export type LibraryUsageDb = {
  libraryFile: {
    updateMany: (args: Prisma.LibraryFileUpdateManyArgs) => Promise<{ count: number }>;
  };
};

/**
 * Count one use of every library item a new order references: `useCount + 1`
 * (once per order, however many lines share the file) and `lastUsedAt = now`.
 * Called inside the order-create transaction. Returns how many items changed.
 */
export async function recordLibraryUse(
  db: LibraryUsageDb,
  fileUrls: Iterable<string>,
  now: Date = new Date(),
): Promise<number> {
  const keys = libraryKeysOf(fileUrls);
  if (keys.length === 0) return 0;
  const res = await db.libraryFile.updateMany({
    where: { storageKey: { in: keys } },
    data: { useCount: { increment: 1 }, lastUsedAt: now },
  });
  return res.count;
}
