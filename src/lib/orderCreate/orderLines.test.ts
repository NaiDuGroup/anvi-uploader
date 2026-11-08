import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const tx = vi.hoisted(() => ({
  order: { create: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  orderLine: { create: vi.fn() },
  orderLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  HEAVY_TX_OPTIONS: {},
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));

const helpers = vi.hoisted(() => ({
  AdminOrderResolveError: class AdminOrderResolveError extends Error {},
  adminOrderDtfRunQuantities: vi.fn(),
  deductStockForAdminOrderLines: vi.fn(),
  resolveAdminOrderLineProducts: vi.fn(),
  resolvedLineStockVariantId: vi.fn(() => null),
}));
vi.mock("@/lib/adminOrderCreateHelpers", () => helpers);

import { createOrderWithResolvedLines, resolveOrderLines } from "./orderLines";

const resolved = [{ input: { productType: "mug", files: [] } }] as never;

beforeEach(() => {
  vi.clearAllMocks();
  tx.order.create.mockResolvedValue({ id: "o1", orderNumber: 7 });
  tx.order.findUniqueOrThrow.mockResolvedValue({ id: "o1", orderNumber: 7 });
  tx.order.update.mockResolvedValue({ id: "o1", orderNumber: 7, needsProcurement: true });
  helpers.deductStockForAdminOrderLines.mockResolvedValue({
    needsProcurement: true,
    procurementMeta: { short: 1 },
  });
});

describe("createOrderWithResolvedLines", () => {
  it("deducts stock and flags procurement by default", async () => {
    await createOrderWithResolvedLines({ order: {} as never, resolved, actorId: "u1" });
    expect(helpers.deductStockForAdminOrderLines).toHaveBeenCalledTimes(1);
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { needsProcurement: true, procurementMeta: { short: 1 } } }),
    );
  });

  it("skipStock: no stock movement and no procurement flag (storefront test orders)", async () => {
    await createOrderWithResolvedLines({ order: {} as never, resolved, actorId: null, skipStock: true });
    expect(helpers.deductStockForAdminOrderLines).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.orderLine.create).toHaveBeenCalledTimes(1);
    expect(tx.orderLog.create).toHaveBeenCalledWith({
      data: { orderId: "o1", userId: "client", action: "order_created" },
    });
  });
});

describe("resolveOrderLines · dealer cabinet", () => {
  const clientUv = (clientItem: Record<string, unknown>) =>
    ({
      productType: "uv_print",
      files: [],
      uv: { source: "client", quantity: 1, zones: [], clientItem: { description: "Крышка", ...clientItem } },
    }) as never;

  it("refuses UV on a client's item without photo or size before pricing anything", async () => {
    await expect(resolveOrderLines([clientUv({})], { dealerCabinet: true })).rejects.toThrow("uv_item_photo_required");
    await expect(
      resolveOrderLines([clientUv({ photo: { fileUrl: "uploads/a.jpg", fileName: "a.jpg" } })], { dealerCabinet: true }),
    ).rejects.toThrow("uv_item_size_required");
    expect(helpers.resolveAdminOrderLineProducts).not.toHaveBeenCalled();
  });
});
