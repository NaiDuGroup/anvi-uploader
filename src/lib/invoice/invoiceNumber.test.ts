import { describe, it, expect } from "vitest";
import { formatInvoiceNumber } from "./companyProfile";

describe("formatInvoiceNumber", () => {
  it("zero-pads to 4 digits by default", () => {
    expect(formatInvoiceNumber(1, 4)).toBe("0001");
    expect(formatInvoiceNumber(306, 4)).toBe("0306");
    expect(formatInvoiceNumber(9999, 4)).toBe("9999");
  });

  it("does not truncate when sequence exceeds padding", () => {
    expect(formatInvoiceNumber(12345, 4)).toBe("12345");
  });

  it("supports custom padding", () => {
    expect(formatInvoiceNumber(1, 6)).toBe("000001");
    expect(formatInvoiceNumber(1, 1)).toBe("1");
  });

  it("rejects invalid sequence numbers", () => {
    expect(() => formatInvoiceNumber(0, 4)).toThrow();
    expect(() => formatInvoiceNumber(-3, 4)).toThrow();
    expect(() => formatInvoiceNumber(Number.NaN, 4)).toThrow();
  });
});
