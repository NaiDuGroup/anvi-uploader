import { describe, expect, it } from "vitest";
import { dtfLayoutRunQuantities } from "./dtfLayoutRuns";

describe("dtfLayoutRunQuantities", () => {
  it("adds up the pieces of lines with the same layout", () => {
    const one = (q: number, layoutKey?: string) => ({ sizes: [{ size: "M", quantity: q }], layoutKey });
    expect(dtfLayoutRunQuantities([one(5, "a"), null, one(3), one(5, "a"), one(2, "b")])).toEqual([
      10,
      null,
      3,
      10,
      2,
    ]);
  });
});
