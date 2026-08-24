import { describe, expect, it } from "vitest";
import { buildDesignFileName } from "./fileName";

describe("buildDesignFileName", () => {
  it("joins title, sku and a short id", () => {
    expect(
      buildDesignFileName({
        title: "Dița Marcela",
        sku: "NB-RED-A5",
        designId: "abcdef12-9999",
      }),
    ).toBe("Dița-Marcela_NB-RED-A5_abcdef.png");
  });

  it("falls back when the title is only punctuation", () => {
    expect(
      buildDesignFileName({
        title: "!!!",
        designId: "zzzzzzzz",
      }),
    ).toBe("design_zzzzzz.png");
  });
});
