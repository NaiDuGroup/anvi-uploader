import { describe, expect, it } from "vitest";
import { lfMaterialFamilyKey } from "./lfMaterialFamily";

describe("lfMaterialFamilyKey", () => {
  it("merges the two ORACAL MATT roll widths into one family", () => {
    expect(lfMaterialFamilyKey("ORACAL MATT 1.27*50m")).toBe("ORACAL MATT");
    expect(lfMaterialFamilyKey("ORACAL MATT 1.62*50m")).toBe("ORACAL MATT");
  });

  it("keeps every other production catalog name a distinct family", () => {
    // Real names from the production catalog as of 2026-08.
    const families = [
      "BANNER MATT 1.37*50m",
      "BANNER Roll Up MATT 1.07*30m",
      "ORACAL GLOSS 1.27*50m",
      "PHOTO PAPER 200G 1.07*75m",
      "Panza din bumbac 1.07*20m",
    ].map(lfMaterialFamilyKey);

    expect(families).toEqual([
      "BANNER MATT",
      "BANNER Roll Up MATT",
      "ORACAL GLOSS",
      "PHOTO PAPER 200G",
      "Panza din bumbac",
    ]);
    expect(new Set(families).size).toBe(families.length);
  });

  it("tolerates comma decimals and spaces around the asterisk", () => {
    expect(lfMaterialFamilyKey("ORACAL MATT 1,62 * 50 m")).toBe("ORACAL MATT");
  });

  it("falls back to the full name when there is no roll-size suffix", () => {
    expect(lfMaterialFamilyKey("Custom vinyl")).toBe("Custom vinyl");
    expect(lfMaterialFamilyKey("  Custom   vinyl  ")).toBe("Custom vinyl");
  });

  it("does not merge names that differ before the size token", () => {
    expect(lfMaterialFamilyKey("ORACAL MATT PREMIUM 1.62*50m")).toBe(
      "ORACAL MATT PREMIUM",
    );
    expect(lfMaterialFamilyKey("ORACAL MATT PREMIUM 1.62*50m")).not.toBe(
      lfMaterialFamilyKey("ORACAL MATT 1.62*50m"),
    );
  });
});
