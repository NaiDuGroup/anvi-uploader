import { describe, it, expect } from "vitest";
import { settlePosSchema } from "@/lib/validations";
import {
  autoSelectOpenInvoiceIds,
  buildManualReceiptRef,
  isReceiptPhotoKey,
} from "./posSettle";

describe("autoSelectOpenInvoiceIds", () => {
  it("auto-selects when exactly one open invoice", () => {
    expect(autoSelectOpenInvoiceIds([{ id: "a" }])).toEqual(["a"]);
  });

  it("returns empty when multiple — UI must pick", () => {
    expect(
      autoSelectOpenInvoiceIds([{ id: "a" }, { id: "b" }]),
    ).toEqual([]);
  });

  it("returns empty when none", () => {
    expect(autoSelectOpenInvoiceIds([])).toEqual([]);
  });
});

describe("buildManualReceiptRef", () => {
  it("formats cash/card marker with date", () => {
    const at = new Date(2026, 6, 16); // 16.07.2026
    expect(buildManualReceiptRef("cash", at)).toBe("Manual cash 16.07.2026");
    expect(buildManualReceiptRef("card", at)).toBe("Manual card 16.07.2026");
  });
});

describe("isReceiptPhotoKey", () => {
  it("accepts receipts/ keys", () => {
    expect(isReceiptPhotoKey("receipts/101/abc.jpg")).toBe(true);
  });

  it("rejects traversal and other prefixes", () => {
    expect(isReceiptPhotoKey("uploads/x.jpg")).toBe(false);
    expect(isReceiptPhotoKey("receipts/../x.jpg")).toBe(false);
    expect(isReceiptPhotoKey("")).toBe(false);
  });
});

describe("settlePosSchema", () => {
  it("accepts a valid settle body", () => {
    const parsed = settlePosSchema.parse({
      method: "cash",
      fiscalInvoiceIds: ["550e8400-e29b-41d4-a716-446655440000"],
      photoKey: "receipts/1014600000369/1-photo.jpg",
      note: null,
    });
    expect(parsed.method).toBe("cash");
    expect(parsed.fiscalInvoiceIds).toHaveLength(1);
  });

  it("rejects photo keys outside receipts/", () => {
    expect(() =>
      settlePosSchema.parse({
        method: "card",
        fiscalInvoiceIds: ["550e8400-e29b-41d4-a716-446655440000"],
        photoKey: "uploads/evil.jpg",
      }),
    ).toThrow();
  });

  it("requires at least one invoice id", () => {
    expect(() =>
      settlePosSchema.parse({
        method: "cash",
        fiscalInvoiceIds: [],
        photoKey: "receipts/x/y.jpg",
      }),
    ).toThrow();
  });
});
