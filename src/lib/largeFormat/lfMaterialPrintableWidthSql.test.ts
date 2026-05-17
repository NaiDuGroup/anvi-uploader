import { describe, expect, it } from "vitest";
import { isPrismaUnknownPrintableWidthMetersError } from "./lfMaterialPrintableWidthSql";

describe("isPrismaUnknownPrintableWidthMetersError", () => {
  it("detects Prisma validation message", () => {
    expect(
      isPrismaUnknownPrintableWidthMetersError(
        new Error("Unknown argument `printableWidthMeters`. Available options"),
      ),
    ).toBe(true);
    expect(
      isPrismaUnknownPrintableWidthMetersError(
        new Error(`Unknown argument 'printableWidthMeters'.`),
      ),
    ).toBe(true);
  });
  it("returns false for unrelated errors", () => {
    expect(isPrismaUnknownPrintableWidthMetersError(new Error("timeout"))).toBe(false);
  });
});
