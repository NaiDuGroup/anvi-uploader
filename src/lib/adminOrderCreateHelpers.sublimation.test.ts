import { beforeEach, describe, expect, it, vi } from "vitest";

const subl = vi.hoisted(() => ({
  consumeMugPrintStock: vi.fn(),
  deductSublimationLineStock: vi.fn(),
  returnSublimationStockForOrder: vi.fn(),
}));
const mug = vi.hoisted(() => ({ consumeMugLineStock: vi.fn() }));
vi.mock("@/lib/sublimation/sublimationOrderStock", () => subl);
vi.mock("@/lib/mug/mugOrderStock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mug/mugOrderStock")>()),
  ...mug,
}));

import type { Prisma } from "@prisma/client";
import { deductStockForAdminOrderLines, expandToOneFilePerLine, type ResolvedAdminOrderLine } from "./adminOrderCreateHelpers";
import { buildSublimationLineData } from "@/lib/sublimation/buildSublimationLineData";
import { COSTS, PILLOW, SETTINGS } from "@/lib/sublimation/sublimationTestFixtures";

const file = (copies: number) => ({ fileName: "a.png", fileUrl: "k", copies, color: "color" as const });

function tx(lineIds: string[]) {
  return { orderLine: { findMany: vi.fn(async () => lineIds.map((id) => ({ id }))) } } as unknown as Prisma.TransactionClient;
}

const params = { orderId: "o1", orderNumber: 12, createdById: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  subl.deductSublimationLineStock.mockResolvedValue([]);
  mug.consumeMugLineStock.mockResolvedValue(null);
});

describe("deductStockForAdminOrderLines (sublimation and mugs)", () => {
  it("a «Кружка» line takes the mug and the Epson consumables by the mugs norm (also «other» mugs)", async () => {
    const resolved = [
      {
        input: { productType: "mug", files: [file(3), file(2)] },
        mugExtras: { stockVariantId: "v-mug", mugProductSnapshot: null },
      },
      { input: { productType: "mug", mugOther: true, files: [file(4)] }, mugExtras: undefined },
    ] as unknown as ResolvedAdminOrderLine[];
    await deductStockForAdminOrderLines(tx(["l1", "l2"]), { ...params, resolved });
    expect(mug.consumeMugLineStock).toHaveBeenCalledTimes(1);
    expect(subl.consumeMugPrintStock.mock.calls.map((c) => c[1])).toEqual([
      { quantity: 5, orderLineId: "l1", ...params },
      { quantity: 4, orderLineId: "l2", ...params },
    ]);
  });

  it("a sublimation line deducts its frozen snapshot and reports shortages", async () => {
    const data = buildSublimationLineData({ variantId: PILLOW.id, quantity: 2 }, "retail", {
      item: PILLOW,
      settings: SETTINGS,
      consumableCosts: COSTS,
    });
    const issue = { kind: "stock_variant", variantId: PILLOW.id, label: "Pernă / Сатин", requestedQty: 2, stockAtOrder: 0 };
    subl.deductSublimationLineStock.mockResolvedValue([issue]);
    const resolved = [
      { input: { productType: "sublimation_print", files: [file(2)] }, sublimationExtras: { sublimationLineData: data } },
    ] as unknown as ResolvedAdminOrderLine[];
    const res = await deductStockForAdminOrderLines(tx(["l1"]), { ...params, resolved });
    expect(subl.deductSublimationLineStock).toHaveBeenCalledWith(expect.anything(), data, { ...params, orderLineId: "l1" });
    expect(subl.consumeMugPrintStock).not.toHaveBeenCalled();
    expect(res.needsProcurement).toBe(true);
  });
});

describe("expandToOneFilePerLine (sublimation)", () => {
  it("keeps a sublimation line with several transfer files together", () => {
    const line = { productType: "sublimation_print" as const, files: [file(2), file(2)] };
    expect(expandToOneFilePerLine([line])).toEqual([line]);
  });
});
