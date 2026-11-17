import { describe, expect, it } from "vitest";
import { phoneQueryDigits, phoneSearchDigitVariants, stripMoldovaPrefix } from "./phoneNormalize";

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

describe("phoneQueryDigits", () => {
  it("drops spaces, +, -, (, ) and . from a phone-like query", () => {
    expect(phoneQueryDigits("+373 68 900999")).toBe("37368900999");
    expect(phoneQueryDigits("(068) 900-999")).toBe("068900999");
    expect(phoneQueryDigits("68.900.999")).toBe("68900999");
    expect(phoneQueryDigits(" 900999 ")).toBe("900999");
  });

  it("is null for text, «#» order numbers and short queries", () => {
    expect(phoneQueryDigits("Ion 069")).toBeNull();
    expect(phoneQueryDigits("#10300")).toBeNull();
    expect(phoneQueryDigits("+3")).toBeNull();
    expect(phoneQueryDigits("")).toBeNull();
  });

  it("the variants follow the same rule (letters → no phone match)", () => {
    expect(phoneSearchDigitVariants("Ion 069 123")).toEqual([]);
    expect(phoneSearchDigitVariants("+373 68 900999")).toEqual(["37368900999", "68900999"]);
  });
});

describe("stripMoldovaPrefix", () => {
  it("drops one leading 373 or 0", () => {
    for (const q of ["068900999", "68900999", "37368900999"]) {
      expect(stripMoldovaPrefix(q)).toBe("68900999");
    }
    expect(stripMoldovaPrefix("000000001")).toBe("00000001");
  });
});
