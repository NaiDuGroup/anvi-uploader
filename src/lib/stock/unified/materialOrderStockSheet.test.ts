/**
 * Write-off of a wide-format sheet material (VATMAN A1): whole sheets from the
 * material's variant; short stock → nothing taken, `lf_roll` entry in sheets.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const consume = vi.fn();
vi.mock("./ledger", () => ({
  consume: (...args: unknown[]) => consume(...args),
  returnToStock: vi.fn(),
}));
vi.mock("./materials", async (orig) => ({
  ...(await orig<typeof import("./materials")>()),
  requireLfMaterialVariantId: vi.fn(async () => "variant-vatman"),
}));

import { takeMaterialLineStock } from "./materialOrderStock";
import { lfLineStockQuantity, packLfSheets } from "@/lib/largeFormat/lfSheet";

const tx = { orderLine: { update: vi.fn(async () => ({})) } } as unknown as Prisma.TransactionClient;
const ref = { orderId: "o1", orderNumber: 101, createdById: null, orderLineId: "l1" };

describe("takeMaterialLineStock — sheet material", () => {
  beforeEach(() => consume.mockReset());

  it("takes whole sheets (5 × A3 on A1 → 2 sheets)", async () => {
    consume.mockResolvedValue({ consumed: true, requested: 2, available: 10 });
    const pack = packLfSheets({
      itemWidthCm: 29.7,
      itemHeightCm: 42,
      quantity: 5,
      sheet: { sheetWidthCm: 61, sheetHeightCm: 86, marginMm: 5 },
    });
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;
    const quantity = lfLineStockQuantity({ calculatedLinearMeters: 0, sheetLayout: pack.layout });
    const issue = await takeMaterialLineStock(tx, { ...ref, kind: "roll", materialId: "m-vatman", quantity, lfUnit: "sheets" });
    expect(issue).toBeNull();
    expect(consume).toHaveBeenCalledWith(tx, expect.objectContaining({ variantId: "variant-vatman", quantity: 2 }));
  });

  it("short stock: nothing taken, procurement entry counted in sheets", async () => {
    consume.mockResolvedValue({ consumed: false, requested: 3, available: 1 });
    const issue = await takeMaterialLineStock(tx, { ...ref, kind: "roll", materialId: "m-vatman", quantity: 3, lfUnit: "sheets" });
    expect(issue).toEqual({
      kind: "lf_roll",
      materialId: "m-vatman",
      requestedLinearMeters: 3,
      stockAtOrder: 1,
      unit: "sheets",
    });
  });

  it("rolls are unchanged: metres, no unit", async () => {
    consume.mockResolvedValue({ consumed: false, requested: 1.25, available: 0.5 });
    const issue = await takeMaterialLineStock(tx, { ...ref, kind: "roll", materialId: "m-roll", quantity: 1.25 });
    expect(issue).toEqual({ kind: "lf_roll", materialId: "m-roll", requestedLinearMeters: 1.25, stockAtOrder: 0.5 });
  });
});
