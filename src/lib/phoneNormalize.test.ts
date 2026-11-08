import { describe, expect, it } from "vitest";
import { phoneSearchDigitVariants } from "./phoneNormalize";

describe("phoneSearchDigitVariants", () => {
  it("matches local and +373 forms both ways", () => {
    expect(phoneSearchDigitVariants("069 123 456")).toEqual(["069123456", "69123456"]);
    expect(phoneSearchDigitVariants("+373 69 123 456")).toEqual(["37369123456", "69123456"]);
    expect(phoneSearchDigitVariants("69123")).toEqual(["69123"]);
  });

  it("strips one prefix only, so leading zeros of the number stay", () => {
    // «000000001» (local) ↔ «+37300000001»: both contain «00000001».
    expect(phoneSearchDigitVariants("000000001")).toEqual(["000000001", "00000001"]);
    expect(phoneSearchDigitVariants("+37300000001")).toEqual(["37300000001", "00000001"]);
  });

  it("ignores names and short queries", () => {
    expect(phoneSearchDigitVariants("ТЕСТ Claude набор")).toEqual([]);
    expect(phoneSearchDigitVariants("07")).toEqual([]);
  });
});
