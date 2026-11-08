import { describe, expect, it } from "vitest";
import { parseOrderFileExpiryAt } from "@/lib/orderFileLifecycle";
import {
  deliveredAutoMarksPaid,
  isShopOrderFileKey,
  shopOrderFileKey,
  shopKeysSafeToDelete,
  shopOrderFilesReleasable,
} from "./orderRules";

describe("deliveredAutoMarksPaid", () => {
  it("studio orders are marked paid on DELIVERED, storefront orders are not", () => {
    expect(deliveredAutoMarksPaid({ source: "studio" })).toBe(true);
    expect(deliveredAutoMarksPaid({ source: undefined })).toBe(true);
    expect(deliveredAutoMarksPaid({ source: "shop" })).toBe(false);
  });

  it("dealer orders are never marked paid on DELIVERED (paid monthly, by hand)", () => {
    expect(deliveredAutoMarksPaid({ source: "studio", clientIsDealer: true })).toBe(false);
    expect(deliveredAutoMarksPaid({ source: "cabinet", clientIsDealer: true })).toBe(false);
    expect(deliveredAutoMarksPaid({ source: "shop", clientIsDealer: true })).toBe(false);
  });

  it("non-dealer clients are still marked paid on DELIVERED", () => {
    expect(deliveredAutoMarksPaid({ source: "studio", clientIsDealer: false })).toBe(true);
    expect(deliveredAutoMarksPaid({ source: "cabinet", clientIsDealer: null })).toBe(true);
  });
});

describe("storefront order files", () => {
  const DAY = 86_400_000;
  const now = new Date("2026-12-31T00:00:00Z");
  const order = (over: Partial<Parameters<typeof shopOrderFilesReleasable>[0]>) => ({
    source: "shop",
    status: "NEW",
    paymentStatus: "paid",
    isPaid: true,
    createdAt: new Date(now.getTime() - 60 * DAY),
    deletedAt: null,
    ...over,
  });

  it("copies uploads/ keys to shop-orders/, which the 7-day lifecycle badge ignores", () => {
    const key = shopOrderFileKey("uploads/1701234567890-abc-logo.png");
    expect(key).toBe("shop-orders/1701234567890-abc-logo.png");
    expect(isShopOrderFileKey(key)).toBe(true);
    expect(parseOrderFileExpiryAt(key)).toBeNull();
  });

  it("keeps files of a paid order in production, however old", () => {
    for (const status of ["NEW", "IN_PROGRESS", "WORKSHOP_PRINTING", "RETURNED_TO_STUDIO", "ISSUE"]) {
      expect(shopOrderFilesReleasable(order({ status }), now)).toBe(false);
    }
  });

  it("releases files once DELIVERED or cancelled (trash), but not before 14 days from creation", () => {
    expect(shopOrderFilesReleasable(order({ status: "DELIVERED" }), now)).toBe(true);
    expect(shopOrderFilesReleasable(order({ deletedAt: now }), now)).toBe(true);
    expect(shopOrderFilesReleasable(order({ status: "DELIVERED", createdAt: new Date(now.getTime() - 3 * DAY) }), now)).toBe(false);
  });

  it("releases files of an order never paid after 30 days", () => {
    const unpaid = { paymentStatus: "pending", isPaid: false };
    expect(shopOrderFilesReleasable(order({ ...unpaid, createdAt: new Date(now.getTime() - 31 * DAY) }), now)).toBe(true);
    expect(shopOrderFilesReleasable(order({ ...unpaid, createdAt: new Date(now.getTime() - 20 * DAY) }), now)).toBe(false);
  });

  it("never selects studio orders", () => {
    expect(shopOrderFilesReleasable(order({ source: "studio", status: "DELIVERED" }), now)).toBe(false);
  });

  it("account orders keep their files after delivery / trash; guest orders keep the old rules", () => {
    const acc = { shopCustomerId: "cust-1" };
    expect(shopOrderFilesReleasable(order({ ...acc, status: "DELIVERED" }), now)).toBe(false);
    expect(shopOrderFilesReleasable(order({ ...acc, deletedAt: now }), now)).toBe(false);
    expect(shopOrderFilesReleasable(order({ shopCustomerId: null, status: "DELIVERED" }), now)).toBe(true);
  });

  it("account orders never paid are released after 30 days", () => {
    const acc = { shopCustomerId: "cust-1", paymentStatus: "pending", isPaid: false };
    expect(shopOrderFilesReleasable(order({ ...acc, createdAt: new Date(now.getTime() - 31 * DAY) }), now)).toBe(true);
    expect(shopOrderFilesReleasable(order({ ...acc, createdAt: new Date(now.getTime() - 29 * DAY) }), now)).toBe(false);
  });

  it("an object still used by a kept order (repeated order, same key) is not deleted", () => {
    expect(shopKeysSafeToDelete(["shop-orders/a", "shop-orders/b", "shop-orders/a"], new Set(["shop-orders/b"]))).toEqual(["shop-orders/a"]);
  });

  it("never returns a library/ (or any non-storefront) key, even unreferenced", () => {
    expect(
      shopKeysSafeToDelete(
        ["library/common/abcDEF1234-logo.pdf", "uploads/1700000000000-abcdefgh-a.pdf", "designs/x.png", "shop-orders/a"],
        new Set(),
      ),
    ).toEqual(["shop-orders/a"]);
  });
});
