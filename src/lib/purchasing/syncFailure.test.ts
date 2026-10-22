import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { PurchaseSyncFailure } from "./dto";
import { classifySyncFailure, syncFailureDetail } from "./syncFailure";

describe("classifySyncFailure", () => {
  it("recognises a missing table or column", () => {
    const err = new Prisma.PrismaClientKnownRequestError("The table `purchase_invoices` does not exist", {
      code: "P2021",
      clientVersion: "5.22.0",
    });
    expect(classifySyncFailure(err)).toBe(PurchaseSyncFailure.DatabaseSchemaOutdated);
    expect(syncFailureDetail(err)).toMatch(/^P2021: /);
  });

  it("recognises e-Factura transport errors", () => {
    expect(classifySyncFailure(new Error("e-Factura SearchInvoices failed: HTTP 500"))).toBe(
      PurchaseSyncFailure.EFacturaUnavailable,
    );
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(classifySyncFailure(abort)).toBe(PurchaseSyncFailure.EFacturaUnavailable);
    expect(classifySyncFailure(new TypeError("fetch failed"))).toBe(
      PurchaseSyncFailure.EFacturaUnavailable,
    );
  });

  it("falls back to unknown and keeps detail short", () => {
    expect(classifySyncFailure(new RangeError("boom"))).toBe(PurchaseSyncFailure.Unknown);
    expect(syncFailureDetail(new Error("x".repeat(1000))).length).toBeLessThanOrEqual(300);
  });
});
