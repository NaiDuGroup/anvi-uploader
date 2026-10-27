import { describe, expect, it } from "vitest";
import { orderNumbersFileNamePart } from "./orderNumbersFileNamePart";

describe("orderNumbersFileNamePart", () => {
  it("lists unique numbers in ascending order", () => {
    expect(orderNumbersFileNamePart([2470, 2468, null, 2469, 2468])).toBe(
      "2468_2469_2470",
    );
  });
  it("returns empty string when nothing is known", () => {
    expect(orderNumbersFileNamePart([null, undefined])).toBe("");
  });
  it("collapses the tail past the limit", () => {
    expect(orderNumbersFileNamePart([1, 2, 3, 4, 5], 3)).toBe("1_2_3_+2");
  });
});
