import { beforeEach, describe, expect, it, vi } from "vitest";

const consume = vi.fn();
const returnToStock = vi.fn();
vi.mock("@/lib/stock/unified/ledger", () => ({
  consume: (...args: unknown[]) => consume(...args),
  returnToStock: (...args: unknown[]) => returnToStock(...args),
}));

import { returnGiftSetBoxStockForOrder, takeGiftSetBoxStockForStoredLine } from "./giftSetStock";

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

describe("box line of a set (from 2026-11-08) and older orders without one", () => {
  beforeEach(() => {
    consume.mockReset();
    consume.mockResolvedValue({ consumed: true, costMdl: null });
    returnToStock.mockReset();
  });

  const boxLine = { ...setData("EW-BOX-300X230X85"), role: "box", roleLabel: "Коробка", lineTotalMdl: 0 };

  it("restore of a new set takes the box once, through the box line (item lines carry no box)", async () => {
    const lines = [
      { id: "l-mug", setGroupId: "g", setData: setData(null) },
      { id: "l-nb", setGroupId: "g", setData: { ...setData(null), role: "notebook" } },
      { id: "l-box", setGroupId: "g", setData: boxLine },
    ];
    for (const l of lines) await takeGiftSetBoxStockForStoredLine(tx, l, ref);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]![1]).toMatchObject({ quantity: 4, orderLineId: "l-box" });
  });

  it("restore of an older set (box hidden on the first line) still takes it once", async () => {
    const lines = [
      { id: "l-mug", setGroupId: "g", setData: setData("EW-BOX-300X230X85") },
      { id: "l-pen", setGroupId: "g", setData: { ...setData(null), role: "pen" } },
    ];
    for (const l of lines) await takeGiftSetBoxStockForStoredLine(tx, l, ref);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]![1]).toMatchObject({ orderLineId: "l-mug" });
  });

  it("edit / delete returns what the order holds of both: an old set's box on its first line, a new set's on its box line", async () => {
    const findMany = vi.fn(async () => [
      { setData: setData("EW-BOX-300X230X85") },
      { setData: { ...setData(null), role: "pen" } },
      { setData: { ...boxLine, boxSku: "EW-BOX-215X200X30", quantity: 1 } },
    ]);
    const groupBy = vi.fn(async () => [
      { variantId: "v-box-a", orderLineId: "l-mug", _sum: { delta: { toString: () => "-2" } } },
      { variantId: "v-box-b", orderLineId: "l-box", _sum: { delta: { toString: () => "-1" } } },
      // Already returned (net 0): nothing more.
      { variantId: "v-box-b", orderLineId: "l-old", _sum: { delta: { toString: () => "0" } } },
    ]);
    const db = { orderLine: { findMany }, stockMovement: { groupBy } } as never;
    await returnGiftSetBoxStockForOrder(db, ref);
    const where = (groupBy.mock.calls[0] as unknown as [{ where: { variant: { sku: { in: string[] } } } }])[0].where;
    expect(where.variant.sku.in.sort()).toEqual(["EW-BOX-215X200X30", "EW-BOX-300X230X85"]);
    expect(returnToStock.mock.calls.map((c) => c[1])).toEqual([
      expect.objectContaining({ variantId: "v-box-a", quantity: 2, orderLineId: "l-mug" }),
      expect.objectContaining({ variantId: "v-box-b", quantity: 1, orderLineId: "l-box" }),
    ]);
  });
});
