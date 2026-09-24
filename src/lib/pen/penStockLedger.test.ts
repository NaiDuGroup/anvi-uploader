import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { PenStockTx } from "./penStockLedger";
import {
  tryRecordPenStockSale,
  recordPenStockSale,
  InsufficientPenStockError,
  recordPenStockReturnOnOrderDelete,
  recordPenStockReceipt,
  recordPenStockInventoryAdjustment,
} from "./penStockLedger";
import { PEN_STOCK_KIND } from "./penStockKinds";

describe("penStockLedger", () => {
  let mockTx: PenStockTx;
  let mockPenProduct: {
    id: string;
    sku: string;
    stockQuantity: number;
  };

  beforeEach(() => {
    mockPenProduct = {
      id: "pen-1",
      sku: "PEN-001",
      stockQuantity: 10,
    };

    mockTx = {
      penProduct: {
        updateMany: async ({ where, data }: { where: { id: string; stockQuantity?: { gte: number } }; data: { stockQuantity: { decrement: number } } }) => {
          if (where.stockQuantity && mockPenProduct.stockQuantity >= where.stockQuantity.gte) {
            mockPenProduct.stockQuantity -= data.stockQuantity.decrement;
            return { count: 1 };
          }
          return { count: 0 };
        },
        findUnique: async () => mockPenProduct,
        update: async ({ data }: { data: { stockQuantity: { increment?: number; decrement?: number } } | { stockQuantity: number } }) => {
          if (typeof data.stockQuantity === 'object' && data.stockQuantity !== null) {
            if ('increment' in data.stockQuantity) {
              mockPenProduct.stockQuantity += data.stockQuantity.increment!;
            } else if ('decrement' in data.stockQuantity) {
              mockPenProduct.stockQuantity -= data.stockQuantity.decrement!;
            }
          } else {
            mockPenProduct.stockQuantity = data.stockQuantity as number;
          }
          return mockPenProduct;
        },
      },
      penStockMovement: {
        create: async () => ({}),
      },
    } as unknown as PenStockTx;
  });

  describe("tryRecordPenStockSale", () => {
    it("deducts stock when sufficient", async () => {
      const result = await tryRecordPenStockSale(mockTx, {
        penProductId: "pen-1",
        quantity: 5,
        orderId: "order-1",
        orderNumber: 1,
        createdById: "user-1",
      });

      expect(result).toEqual({ deducted: true });
      expect(mockPenProduct.stockQuantity).toBe(5);
    });

    it("returns deducted false when stock insufficient", async () => {
      const result = await tryRecordPenStockSale(mockTx, {
        penProductId: "pen-1",
        quantity: 15,
        orderId: "order-1",
        orderNumber: 1,
        createdById: "user-1",
      });

      expect(result).toEqual({
        deducted: false,
        penProductId: "pen-1",
        requested: 15,
        available: 10,
      });
      expect(mockPenProduct.stockQuantity).toBe(10);
    });

    it("returns deducted true when penProductId is null", async () => {
      const result = await tryRecordPenStockSale(mockTx, {
        penProductId: null,
        quantity: 5,
        orderId: "order-1",
        orderNumber: 1,
        createdById: "user-1",
      });

      expect(result).toEqual({ deducted: true });
    });

    it("returns deducted true when quantity is 0 or negative", async () => {
      const result = await tryRecordPenStockSale(mockTx, {
        penProductId: "pen-1",
        quantity: 0,
        orderId: "order-1",
        orderNumber: 1,
        createdById: "user-1",
      });

      expect(result).toEqual({ deducted: true });
    });
  });

  describe("recordPenStockSale", () => {
    it("throws InsufficientPenStockError when stock insufficient", async () => {
      await expect(
        recordPenStockSale(mockTx, {
          penProductId: "pen-1",
          quantity: 15,
          orderId: "order-1",
          orderNumber: 1,
          createdById: "user-1",
        })
      ).rejects.toThrow(InsufficientPenStockError);
    });
  });

  describe("recordPenStockReturnOnOrderDelete", () => {
    it("increments stock when order is deleted", async () => {
      mockPenProduct.stockQuantity = 5;

      await recordPenStockReturnOnOrderDelete(mockTx, {
        penProductId: "pen-1",
        quantity: 3,
        orderId: "order-1",
        orderNumber: 1,
        createdById: "user-1",
      });

      expect(mockPenProduct.stockQuantity).toBe(8);
    });

    it("does nothing when penProductId is null", async () => {
      const initialStock = mockPenProduct.stockQuantity;

      await recordPenStockReturnOnOrderDelete(mockTx, {
        penProductId: null,
        quantity: 5,
        orderId: "order-1",
        orderNumber: 1,
        createdById: "user-1",
      });

      expect(mockPenProduct.stockQuantity).toBe(initialStock);
    });
  });

  describe("recordPenStockReceipt", () => {
    it("increments stock on receipt", async () => {
      mockPenProduct.stockQuantity = 10;

      await recordPenStockReceipt(mockTx, {
        penProductId: "pen-1",
        quantity: 20,
        note: "New batch",
        createdById: "user-1",
      });

      expect(mockPenProduct.stockQuantity).toBe(30);
    });

    it("does nothing when quantity is 0 or negative", async () => {
      const initialStock = mockPenProduct.stockQuantity;

      await recordPenStockReceipt(mockTx, {
        penProductId: "pen-1",
        quantity: 0,
        createdById: "user-1",
      });

      expect(mockPenProduct.stockQuantity).toBe(initialStock);
    });
  });

  describe("recordPenStockInventoryAdjustment", () => {
    it("adjusts stock to actual count (positive delta)", async () => {
      mockPenProduct.stockQuantity = 10;

      await recordPenStockInventoryAdjustment(mockTx, {
        penProductId: "pen-1",
        actualStock: 15,
        note: "Physical count found 15",
        createdById: "user-1",
      });

      expect(mockPenProduct.stockQuantity).toBe(15);
    });

    it("adjusts stock to actual count (negative delta)", async () => {
      mockPenProduct.stockQuantity = 10;

      await recordPenStockInventoryAdjustment(mockTx, {
        penProductId: "pen-1",
        actualStock: 7,
        note: "Physical count found 7",
        createdById: "user-1",
      });

      expect(mockPenProduct.stockQuantity).toBe(7);
    });

    it("does nothing when actual stock equals current stock", async () => {
      mockPenProduct.stockQuantity = 10;

      await recordPenStockInventoryAdjustment(mockTx, {
        penProductId: "pen-1",
        actualStock: 10,
        createdById: "user-1",
      });

      expect(mockPenProduct.stockQuantity).toBe(10);
    });

    it("throws error when product not found", async () => {
      mockTx.penProduct.findUnique = async () => null;

      await expect(
        recordPenStockInventoryAdjustment(mockTx, {
          penProductId: "nonexistent",
          actualStock: 10,
          createdById: "user-1",
        })
      ).rejects.toThrow("Pen product not found");
    });
  });
});
