import { describe, expect, it } from "vitest";
import { dtfSizesText, isDtfOneSize } from "./dtfSizesText";

const ru = (n: number) => `${n} шт.`;

describe("dtfSizesText", () => {
  it("one-size items (caps, bags) show pieces, not «—×1»", () => {
    expect(dtfSizesText([{ size: "—", quantity: 1 }], ru)).toBe("1 шт.");
    expect(dtfSizesText([{ size: "", quantity: 10 }], ru)).toBe("10 шт.");
  });
  it("sized garments keep «M×2  L×1» and skip empty sizes", () => {
    expect(
      dtfSizesText(
        [
          { size: "M", quantity: 2 },
          { size: "L", quantity: 1 },
          { size: "XL", quantity: 0 },
        ],
        ru,
      ),
    ).toBe("M×2  L×1");
  });
  it("isDtfOneSize", () => {
    expect(isDtfOneSize("—")).toBe(true);
    expect(isDtfOneSize(" ")).toBe(true);
    expect(isDtfOneSize("S")).toBe(false);
  });
});
