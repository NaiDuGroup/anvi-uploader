import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => {
  const d = {
    order: { findUnique: vi.fn() },
    file: { create: vi.fn((x: unknown) => x) },
    orderLog: { create: vi.fn((x: unknown) => x) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return d;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const files = vi.hoisted(() => ({ copyUploadToShopOrders: vi.fn(async (k: string) => k.replace(/^uploads\//, "shop-orders/")) }));
vi.mock("./shopFiles", () => files);

import { addShopOrderLineFile } from "./orderFiles";
import { buildShopOrderView, missingDtfFileZones } from "./orderView";
import { dtfZonesWithoutFile } from "@/lib/storefront/fileRules";

const KEY = "uploads/1762250000000-abcdefgh-logo.png";
const dtfLineData = (zones: string[]) => ({
  kind: "dtf",
  title: "Tricou",
  quantity: 2,
  total: 560,
  quote: { kind: "dtf", garmentId: "g:", sizes: [{ size: "L", quantity: 2 }], zones: zones.map((id) => ({ id, placement: "front", presetId: null })) },
});

function order(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    source: "shop",
    deletedAt: null,
    status: "NEW",
    paymentStatus: "paid",
    isPaid: true,
    shippedAt: null,
    orderLines: [
      { id: "l0", productType: "mug", shopLineData: { kind: "mug", title: "Cană" }, files: [{ paperType: null }] },
      { id: "l1", productType: "dtf_apparel", shopLineData: dtfLineData(["front", "back"]), files: [{ paperType: "dtf:back" }] },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findUnique.mockResolvedValue(order());
});

describe("DTF lines without a file", () => {
  it("names the zones with no file (tagged files cover their zone, an untagged one the first)", () => {
    expect(missingDtfFileZones(dtfLineData(["front", "back"]), [{ paperType: "dtf:back" }])).toEqual(["front"]);
    expect(missingDtfFileZones(dtfLineData(["front", "back"]), [{ paperType: null }])).toEqual(["back"]);
    expect(missingDtfFileZones(dtfLineData(["front"]), [])).toEqual(["front"]);
    expect(missingDtfFileZones({ kind: "mug", quote: { kind: "mug" } }, [])).toEqual([]);
    // Cart: the same rule on the browser's line.
    expect(dtfZonesWithoutFile({ quote: { kind: "dtf", zones: [{ id: "front" }, { id: "back" }] }, files: [{ zone: "front" }] })).toEqual(["back"]);
    expect(dtfZonesWithoutFile({ quote: { kind: "mug" }, files: [] })).toEqual([]);
  });

  it("the order view flags them while the order is open", () => {
    const v = buildShopOrderView({
      orderNumber: 1,
      createdAt: new Date(),
      status: "NEW",
      paymentStatus: "paid",
      isPaid: true,
      shippedAt: null,
      price: 560,
      deliveryPriceMdl: 0,
      deliveryMethod: "pickup",
      deliveryCity: null,
      trackingNumber: null,
      customerName: "Ion",
      clientName: null,
      orderLines: [{ shopLineData: dtfLineData(["front"]), files: [] }],
    });
    expect(v.lines[0]!.missingFileZones).toEqual(["front"]);
    expect(v.canAddFiles).toBe(true);
  });
});

describe("addShopOrderLineFile", () => {
  it("adds the file to the line, tagged with its zone, copied out of uploads/", async () => {
    const res = await addShopOrderLineFile("tok", { line: 1, zone: "front", fileKey: KEY, fileName: "logo.png" });
    expect(res.status).toBe(201);
    expect(db.file.create).toHaveBeenCalledWith({
      data: {
        orderId: "o1",
        orderLineId: "l1",
        fileUrl: "shop-orders/1762250000000-abcdefgh-logo.png",
        fileName: "logo.png",
        copies: 1,
        color: "color",
        paperType: "dtf:front",
      },
    });
    expect(db.orderLog.create).toHaveBeenCalled();
  });

  it("refuses a zone that has its file, a non-DTF line, a shipped order and a foreign key", async () => {
    expect((await addShopOrderLineFile("tok", { line: 1, zone: "back", fileKey: KEY, fileName: "a.png" })).status).toBe(409);
    expect((await addShopOrderLineFile("tok", { line: 0, zone: "front", fileKey: KEY, fileName: "a.png" })).status).toBe(400);
    db.order.findUnique.mockResolvedValueOnce(order({ shippedAt: new Date() }));
    expect((await addShopOrderLineFile("tok", { line: 1, zone: "front", fileKey: KEY, fileName: "a.png" })).status).toBe(409);
    expect((await addShopOrderLineFile("tok", { line: 1, zone: "front", fileKey: "catalog/x.png", fileName: "a.png" })).status).toBe(400);
    db.order.findUnique.mockResolvedValueOnce(order({ source: "studio" }));
    expect((await addShopOrderLineFile("tok", { line: 1, zone: "front", fileKey: KEY, fileName: "a.png" })).status).toBe(404);
    expect(db.file.create).not.toHaveBeenCalled();
  });

  it("an upload that is gone answers file_not_found", async () => {
    files.copyUploadToShopOrders.mockResolvedValueOnce(null as unknown as string);
    const res = await addShopOrderLineFile("tok", { line: 1, zone: "front", fileKey: KEY, fileName: "a.png" });
    expect(res).toEqual({ status: 400, body: { error: "file_not_found" } });
  });
});
