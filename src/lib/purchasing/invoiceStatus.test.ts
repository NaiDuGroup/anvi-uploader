import { describe, it, expect } from "vitest";
import { deriveInvoiceStatus, isPriceDriftSuspicious } from "./invoiceStatus";
import { PurchaseInvoiceStatus, PurchaseLineStatus } from "./types";

describe("deriveInvoiceStatus", () => {
  it("tracks review → partial → posted", () => {
    expect(deriveInvoiceStatus([])).toBe(PurchaseInvoiceStatus.New);
    expect(
      deriveInvoiceStatus([PurchaseLineStatus.Unmatched, PurchaseLineStatus.Suggested]),
    ).toBe(PurchaseInvoiceStatus.NeedsReview);
    expect(deriveInvoiceStatus([PurchaseLineStatus.Posted, PurchaseLineStatus.Unmatched])).toBe(
      PurchaseInvoiceStatus.PartiallyPosted,
    );
    expect(deriveInvoiceStatus([PurchaseLineStatus.Posted, PurchaseLineStatus.Ignored])).toBe(
      PurchaseInvoiceStatus.Posted,
    );
    expect(deriveInvoiceStatus([PurchaseLineStatus.Ignored])).toBe(PurchaseInvoiceStatus.Ignored);
  });
});

describe("isPriceDriftSuspicious", () => {
  it("flags jumps over 30% and ignores missing history", () => {
    expect(isPriceDriftSuspicious(2958.33, 3100)).toBe(false);
    expect(isPriceDriftSuspicious(2958.33, 4200)).toBe(true);
    expect(isPriceDriftSuspicious(100, 60)).toBe(true);
    expect(isPriceDriftSuspicious(null, 4200)).toBe(false);
  });
});
