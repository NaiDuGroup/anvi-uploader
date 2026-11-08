import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const deleteObjects = vi.fn().mockResolvedValue(undefined);
const deleteLocalFile = vi.fn().mockResolvedValue(undefined);
let local = false;
vi.mock("@/lib/r2", () => ({
  copyObject: vi.fn(),
  deleteObjects: (...a: unknown[]) => deleteObjects(...a),
  getObjectBytesIfSmall: vi.fn(),
  isLocalObjectStorage: () => local,
}));
vi.mock("@/lib/local-storage", () => ({
  deleteLocalFile: (...a: unknown[]) => deleteLocalFile(...a),
  readLocalFile: vi.fn(),
  saveLocalFile: vi.fn(),
}));

import { deleteShopOrderFiles } from "./shopFiles";

describe("deleteShopOrderFiles never touches library keys", () => {
  beforeEach(() => {
    deleteObjects.mockClear();
    deleteLocalFile.mockClear();
  });

  it("R2: deletes only shop-orders/ keys", async () => {
    local = false;
    await deleteShopOrderFiles(["shop-orders/a", "library/common/abcDEF1234-x.pdf", "uploads/1700000000000-abcdefgh-y"]);
    expect(deleteObjects).toHaveBeenCalledTimes(1);
    expect(deleteObjects).toHaveBeenCalledWith(["shop-orders/a"]);
  });

  it("R2: a list of only library keys sends no delete at all", async () => {
    local = false;
    await deleteShopOrderFiles(["library/common/abcDEF1234-x.pdf"]);
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it("local storage: same rule", async () => {
    local = true;
    await deleteShopOrderFiles(["library/c/x", "shop-orders/b"]);
    expect(deleteLocalFile).toHaveBeenCalledTimes(1);
    expect(deleteLocalFile).toHaveBeenCalledWith("shop-orders/b");
  });
});
