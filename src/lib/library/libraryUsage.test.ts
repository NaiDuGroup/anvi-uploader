import { describe, expect, it, vi } from "vitest";
import { recordLibraryUse, type LibraryUsageDb } from "./libraryUsage";

function fakeDb(count = 1) {
  const updateMany = vi.fn().mockResolvedValue({ count });
  return { db: { libraryFile: { updateMany } } as unknown as LibraryUsageDb, updateMany };
}

describe("recordLibraryUse", () => {
  it("increments useCount once per distinct library key and stamps lastUsedAt", async () => {
    const { db, updateMany } = fakeDb(2);
    const now = new Date("2026-11-08T10:00:00Z");
    const n = await recordLibraryUse(
      db,
      ["library/common/a-x.pdf", "library/common/a-x.pdf", "library/c1/b-y.png", "uploads/1700000000000-abcdefgh-z.pdf"],
      now,
    );
    expect(n).toBe(2);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { storageKey: { in: ["library/common/a-x.pdf", "library/c1/b-y.png"] } },
      data: { useCount: { increment: 1 }, lastUsedAt: now },
    });
  });

  it("does nothing for an order without library files", async () => {
    const { db, updateMany } = fakeDb();
    expect(await recordLibraryUse(db, ["uploads/1700000000000-abcdefgh-z.pdf", "https://x.y/z"])).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
