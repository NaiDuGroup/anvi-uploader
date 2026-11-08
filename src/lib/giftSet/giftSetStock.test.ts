import { beforeEach, describe, expect, it, vi } from "vitest";

const consume = vi.fn();
vi.mock("@/lib/stock/unified/ledger", () => ({
  consume: (...args: unknown[]) => consume(...args),
  returnToStock: vi.fn(),
}));

import { takeGiftSetBoxStockForStoredLine } from "./giftSetStock";

const tx = {
  stockVariant: {
    findUnique: vi.fn(async () => ({ id: "v-box", label: null, item: { nameRu: "Коробка" } })),
  },
} as never;
const ref = { orderId: "o-1", orderNumber: 7, createdById: "u-1" };
const setData = (boxSku: string | null) => ({
  version: 1,
  templateId: "pen_notebook_mug",
  name: "Ручка + блокнот + кружка",
  kind: "assembled",
  role: "mug",
  roleLabel: "Кружка",
  quantity: 4,
  boxSku,
});

describe("takeGiftSetBoxStockForStoredLine (restore from trash)", () => {
  beforeEach(() => {
    consume.mockReset();
    consume.mockResolvedValue({ consumed: true, costMdl: null });
  });

  it("takes N boxes on the set's box line", async () => {
    const issue = await takeGiftSetBoxStockForStoredLine(tx, { id: "l-1", setGroupId: "g", setData: setData("EW-BOX") }, ref);
    expect(issue).toEqual([]);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]![1]).toMatchObject({ variantId: "v-box", quantity: 4, orderId: "o-1", orderLineId: "l-1" });
  });

  it("takes nothing on the other set lines and on lines outside a set", async () => {
    await takeGiftSetBoxStockForStoredLine(tx, { id: "l-2", setGroupId: "g", setData: setData(null) }, ref);
    await takeGiftSetBoxStockForStoredLine(tx, { id: "l-3", setGroupId: null, setData: null }, ref);
    expect(consume).not.toHaveBeenCalled();
  });

  it("short box → procurement entry", async () => {
    consume.mockResolvedValue({ consumed: false, variantId: "v-box", requested: 4, available: 1 });
    const issue = await takeGiftSetBoxStockForStoredLine(tx, { id: "l-1", setGroupId: "g", setData: setData("EW-BOX") }, ref);
    expect(issue).toMatchObject([{ kind: "stock_variant", variantId: "v-box", requestedQty: 4, stockAtOrder: 1 }]);
  });

  it("ready set with a box: box and set item both short → two procurement entries", async () => {
    consume.mockResolvedValue({ consumed: false, variantId: "v-box", requested: 4, available: 0 });
    const issues = await takeGiftSetBoxStockForStoredLine(
      tx,
      { id: "l-1", setGroupId: "g", setData: { ...setData("EW-BOX"), kind: "ready", role: "ready", setItemSku: "GIFT-SET-THERMOS-BLACK", zoneId: "thermos" } },
      ref,
    );
    expect(consume).toHaveBeenCalledTimes(2);
    expect(issues).toHaveLength(2);
  });
});
