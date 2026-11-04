import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Unpaid storefront orders (source 'shop', paymentStatus != 'paid') are not a
 * client's debt and stay out of the dealer cabinet; the bulk «client paid»
 * keeps the online payment state consistent.
 */

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  order: { findMany: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn((a: unknown) => a) },
  orderLog: { createMany: vi.fn((a: unknown) => a) },
  studioCustomer: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  file: { findMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db, HEAVY_TX_OPTIONS: {} }));
vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(async () => ({ id: "admin-1", role: "admin" })),
  getCustomerSessionUser: vi.fn(async () => ({ id: "u-1", studioCustomerId: "client-1" })),
}));
vi.mock("@/lib/clientMessagesUnread", () => ({ getUnreadClientMessageCountMap: vi.fn(async () => new Map()) }));

import { GET as clientOrders } from "@/app/api/admin/clients/[id]/orders/route";
import { POST as markPaid } from "@/app/api/admin/clients/[id]/mark-paid/route";
import { GET as cabinetOrders } from "@/app/api/cabinet/orders/route";
import { GET as cabinetOrder } from "@/app/api/cabinet/orders/[id]/route";
import { GET as byClient } from "@/app/api/admin/orders/by-client/route";
import { PATCH as patchAdminOrder } from "@/app/api/admin/orders/[id]/route";

const NOT_UNPAID_SHOP = { source: "shop", paymentStatus: { not: "paid" } };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function order(over: Record<string, unknown>) {
  return {
    id: "o",
    orderNumber: 1,
    productType: "mug",
    status: "NEW",
    price: 100,
    isPaid: false,
    paidAt: null,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    notes: null,
    source: "studio",
    paymentStatus: "unpaid",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.studioCustomer.findUnique.mockResolvedValue({ id: "client-1" });
});

describe("admin client card summary", () => {
  it("does not count an unpaid storefront order as debt", async () => {
    db.order.findMany.mockResolvedValue([
      order({ id: "a", price: 100 }),
      order({ id: "b", price: 250, source: "shop", paymentStatus: "pending" }),
      order({ id: "c", price: 40, source: "shop", paymentStatus: "paid", isPaid: true }),
    ]);
    const res = await clientOrders(new NextRequest("http://x/api"), params("client-1"));
    const body = await res.json();
    expect(body.summary).toEqual({ ordersCount: 3, unpaidCount: 1, unpaidTotalMdl: 100, paidTotalMdl: 40 });
  });
});

describe("bulk «client paid»", () => {
  it("settling all debt leaves unpaid storefront orders alone", async () => {
    db.order.findMany.mockResolvedValue([order({ id: "a" })]);
    const res = await markPaid(new NextRequest("http://x/api", { method: "POST", body: "{}" }), params("client-1"));
    expect(await res.json()).toEqual({ paidCount: 1, paidTotalMdl: 100 });
    expect(db.order.findMany.mock.calls[0]![0].where).toMatchObject({ NOT: NOT_UNPAID_SHOP, isPaid: false });
    expect(db.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it("a storefront order picked explicitly is marked paid with paymentStatus='paid'", async () => {
    db.order.findMany.mockResolvedValue([
      order({ id: "a" }),
      order({ id: "s", source: "shop", paymentStatus: "pending" }),
    ]);
    await markPaid(
      new NextRequest("http://x/api", { method: "POST", body: JSON.stringify({ orderIds: ["a", "s"] }) }),
      params("client-1"),
    );
    expect(db.order.findMany.mock.calls[0]![0].where).not.toHaveProperty("NOT");
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "s"] }, isPaid: false },
      data: { isPaid: true, paidAt: expect.any(Date) },
    });
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["s"] }, source: "shop" },
      data: { paymentStatus: "paid" },
    });
  });
});

describe("dealer cabinet", () => {
  it("list + «De plată» skip unpaid storefront orders", async () => {
    db.order.findMany.mockResolvedValue([]);
    db.file.findMany.mockResolvedValue([]);
    const res = await cabinetOrders(new NextRequest("http://x/api/cabinet/orders?search=logo"));
    expect(res.status).toBe(200);
    expect(db.order.findMany.mock.calls[0]![0].where).toEqual({
      clientId: "client-1",
      deletedAt: null,
      NOT: NOT_UNPAID_SHOP,
    });
    expect(db.file.findMany.mock.calls[0]![0].where.order).toEqual({
      clientId: "client-1",
      deletedAt: null,
      NOT: NOT_UNPAID_SHOP,
    });
  });

  it("order detail hides an unpaid storefront order", async () => {
    db.order.findFirst.mockResolvedValue(null);
    const res = await cabinetOrder(new NextRequest("http://x/api"), params("o-1"));
    expect(res.status).toBe(404);
    expect(db.order.findFirst.mock.calls[0]![0].where).toMatchObject({ NOT: NOT_UNPAID_SHOP });
  });
});

describe("invoice order picker", () => {
  it("skips unpaid storefront orders", async () => {
    db.order.findMany.mockResolvedValue([]);
    await byClient(new NextRequest("http://x/api/admin/orders/by-client?clientId=client-1"));
    expect(db.order.findMany.mock.calls[0]![0].where).toEqual({
      clientId: "client-1",
      deletedAt: null,
      NOT: NOT_UNPAID_SHOP,
    });
  });
});

describe("admin order wizard", () => {
  it("refuses to re-save a storefront order (price includes the paid delivery)", async () => {
    db.order.findFirst.mockResolvedValue({ ...order({ id: "s", source: "shop" }), files: [], orderLines: [] });
    const res = await patchAdminOrder(
      new NextRequest("http://x/api", {
        method: "PATCH",
        body: JSON.stringify({ phone: "+37369123456", lines: [] }),
      }),
      params("s"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("shop_order_not_editable");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
