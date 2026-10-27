import { describe, expect, it } from "vitest";
import { buildRollLayoutPdfFileName } from "./rollLayoutPdfFileName";

describe("buildRollLayoutPdfFileName", () => {
  const date = new Date("2026-10-27T12:00:00Z");
  it("puts order numbers before the material", () => {
    expect(
      buildRollLayoutPdfFileName("440gr (banner) 1.37*50m", [2470, 2469, 2468], date),
    ).toBe("layout-2468_2469_2470-440gr-banner-1-37-50m-2026-10-27.pdf");
  });
  it("falls back to the old shape without orders", () => {
    expect(buildRollLayoutPdfFileName("", [], date)).toBe(
      "layout-roll-2026-10-27.pdf",
    );
  });
});
