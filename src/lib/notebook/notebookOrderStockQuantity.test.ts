import { describe, expect, it } from "vitest";
import { notebookOrderStockQuantityFromFiles } from "./notebookOrderStockQuantity";

describe("notebookOrderStockQuantityFromFiles", () => {
  it("sums copies across files", () => {
    expect(
      notebookOrderStockQuantityFromFiles([{ copies: 2 }, { copies: 3 }]),
    ).toBe(5);
  });

  it("treats sum 0 as 1", () => {
    expect(notebookOrderStockQuantityFromFiles([{ copies: 0 }])).toBe(1);
    expect(notebookOrderStockQuantityFromFiles([])).toBe(1);
  });

  it("ignores negative copies in the sum", () => {
    expect(notebookOrderStockQuantityFromFiles([{ copies: -2 }, { copies: 3 }])).toBe(3);
  });
});
