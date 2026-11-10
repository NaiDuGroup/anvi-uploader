import { describe, expect, it } from "vitest";
import { parseAmountValue, parseIdnoValue, pdfContentDisposition } from "./http";

describe("parseIdnoValue", () => {
  it("accepts trimmed alphanumerics 4–20", () => {
    expect(parseIdnoValue(" 1003600000002 ")).toBe("1003600000002");
    expect(parseIdnoValue("320340")).toBe("320340");
  });
  it("rejects anything else (no second URI decode)", () => {
    for (const v of ["", "12", "100%25", "1003 600", "a/b", "x".repeat(21), null, 123, undefined]) {
      expect(parseIdnoValue(v)).toBeNull();
    }
  });
});

describe("parseAmountValue (opening balance)", () => {
  it("finite numbers and numeric strings", () => {
    expect(parseAmountValue(0)).toBe(0);
    expect(parseAmountValue(-1234.5)).toBe(-1234.5);
    expect(parseAmountValue("1 234,50")).toBe(1234.5);
    expect(parseAmountValue("-10.25")).toBe(-10.25);
  });
  it("null / empty / booleans / junk → null (never a silent delete)", () => {
    for (const v of [null, undefined, "", " ", false, true, "abc", "1e5", "12.3.4", NaN, Infinity, {}, []]) {
      expect(parseAmountValue(v)).toBeNull();
    }
  });
});

describe("pdfContentDisposition", () => {
  it("ASCII fallback + RFC 5987 UTF-8 name", () => {
    const h = pdfContentDisposition("act-sverki-ООО_Щука_Ș");
    expect(h).toMatch(/^inline; filename="[\x20-\x7e]+\.pdf"; filename\*=UTF-8''/);
    expect(h).toContain(`filename*=UTF-8''${encodeURIComponent("act-sverki-ООО_Щука_Ș.pdf")}`);
    expect(h).toContain('filename="act-sverki-S.pdf"');
    expect(/[^\x00-\x7f]/.test(h)).toBe(false);
  });
  it("never an empty ASCII name", () => {
    expect(pdfContentDisposition("Щука")).toContain('filename="document.pdf"');
  });
});
