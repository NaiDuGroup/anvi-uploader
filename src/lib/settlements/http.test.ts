import { describe, expect, it } from "vitest";
import { actFileName, fileNameSlug, parseAmountValue, parseIdnoValue, pdfContentDisposition } from "./http";

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

describe("act file names", () => {
  it("drops dots / quotes, one «-» between words", () => {
    expect(actFileName("act-sverki", "CRAFTI BUSINESS S.R.L.", "1004600069507").ascii).toBe(
      "act-sverki-CRAFTI-BUSINESS-SRL-1004600069507",
    );
    expect(fileNameSlug('«Tipografia „Știința”» SRL', true)).toBe("Tipografia-Stiinta-SRL");
    expect(fileNameSlug("  A -- B__C  ", true)).toBe("A-B-C");
  });
  it("transliterates Cyrillic for ASCII, keeps it for UTF-8", () => {
    const f = actFileName("act-sverki", "ООО «Щука»", "100");
    expect(f.ascii).toBe("act-sverki-OOO-Schuka-100");
    expect(f.utf8).toBe("act-sverki-ООО-Щука-100");
    const h = pdfContentDisposition(f.ascii, f.utf8);
    expect(h).toContain('filename="act-sverki-OOO-Schuka-100.pdf"');
    expect(h).toContain(`filename*=UTF-8''${encodeURIComponent("act-sverki-ООО-Щука-100.pdf")}`);
  });
  it("no name → prefix + IDNO", () => {
    expect(actFileName("act-sverki", null, "100").ascii).toBe("act-sverki-100");
    expect(actFileName("act-sverki", "...", "100").ascii).toBe("act-sverki-100");
  });
});
