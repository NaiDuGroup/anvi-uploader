import { beforeEach, describe, expect, it, vi } from "vitest";

const consume = vi.fn();
const returnToStock = vi.fn();
vi.mock("@/lib/stock/unified/ledger", () => ({
  consume: (...args: unknown[]) => consume(...args),
  returnToStock: (...args: unknown[]) => returnToStock(...args),
}));

import { giftSetStockHeldForOrder, returnGiftSetBoxStockForOrder, takeGiftSetBoxStockForStoredLine } from "./giftSetStock";

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

describe("ready set (C): stock line from 2026-11-08 evening, and the v2 hidden write-off", () => {
  beforeEach(() => {
    consume.mockReset();
    consume.mockResolvedValue({ consumed: true, costMdl: null });
    returnToStock.mockReset();
  });

  const ready = (extra: Record<string, unknown>) => ({
    version: 1,
    templateId: "pen_notebook_thermos",
    name: "Ручка + блокнот + термос",
    kind: "ready",
    role: "ready",
    roleLabel: "Термос",
    quantity: 3,
    boxSku: null,
    readyVariantId: "11111111-1111-4111-8111-111111111111",
    ...extra,
  });
  const unitLine = ready({ role: "box", roleLabel: "Набор с термосом", boxSku: "GIFT-SET-THERMOS-BLACK", lineTotalMdl: 0 });

  it("restore of a new C set takes the set item once, on its stock line (print lines carry nothing)", async () => {
    const lines = [
      { id: "l-th", setGroupId: "g", setData: ready({ zoneId: "thermos" }) },
      { id: "l-nb", setGroupId: "g", setData: ready({ zoneId: "notebook", roleLabel: "Блокнот" }) },
      { id: "l-pen", setGroupId: "g", setData: ready({ zoneId: "pen", roleLabel: "Ручка" }) },
      { id: "l-unit", setGroupId: "g", setData: unitLine },
    ];
    for (const l of lines) await takeGiftSetBoxStockForStoredLine(tx, l, ref);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]![1]).toMatchObject({ quantity: 3, orderLineId: "l-unit" });
  });

  it("restore of a v2 C set (set item hidden on the first print line) still takes it once", async () => {
    const lines = [
      { id: "l-th", setGroupId: "g", setData: ready({ zoneId: "thermos", setItemSku: "GIFT-SET-THERMOS-BLACK" }) },
      { id: "l-nb", setGroupId: "g", setData: ready({ zoneId: "notebook" }) },
      { id: "l-pen", setGroupId: "g", setData: ready({ zoneId: "pen" }) },
    ];
    for (const l of lines) await takeGiftSetBoxStockForStoredLine(tx, l, ref);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]![1]).toMatchObject({ quantity: 3, orderLineId: "l-th" });
  });

  it("edit / delete of a v2 C set returns exactly what it holds (by SKU, net), so the rebuilt stock line takes it once", async () => {
    const findMany = vi.fn(async () => [
      { setData: ready({ zoneId: "thermos", setItemSku: "GIFT-SET-THERMOS-BLACK" }) },
      { setData: ready({ zoneId: "notebook" }) },
      { setData: ready({ zoneId: "pen" }) },
    ]);
    const groupBy = vi.fn(async () => [{ variantId: "v-set-black", orderLineId: "l-th", _sum: { delta: { toString: () => "-3" } } }]);
    const db = { orderLine: { findMany }, stockMovement: { groupBy } } as never;
    await returnGiftSetBoxStockForOrder(db, ref);
    const where = (groupBy.mock.calls[0] as unknown as [{ where: { variant: { sku: { in: string[] } } } }])[0].where;
    expect(where.variant.sku.in).toEqual(["GIFT-SET-THERMOS-BLACK"]);
    expect(returnToStock).toHaveBeenCalledTimes(1);
    expect(returnToStock.mock.calls[0]![1]).toMatchObject({ variantId: "v-set-black", quantity: 3, orderLineId: "l-th" });
  });

  it("delete of a new C set returns the set item from its stock line; nothing when already returned", async () => {
    const findMany = vi.fn(async () => [{ setData: ready({ zoneId: "thermos" }) }, { setData: unitLine }]);
    const groupBy = vi
      .fn()
      .mockResolvedValueOnce([{ variantId: "v-set-black", orderLineId: "l-unit", _sum: { delta: { toString: () => "-3" } } }])
      .mockResolvedValueOnce([{ variantId: "v-set-black", orderLineId: "l-unit", _sum: { delta: { toString: () => "0" } } }]);
    const db = { orderLine: { findMany }, stockMovement: { groupBy } } as never;
    await returnGiftSetBoxStockForOrder(db, ref);
    await returnGiftSetBoxStockForOrder(db, ref);
    expect(returnToStock).toHaveBeenCalledTimes(1);
    expect(returnToStock.mock.calls[0]![1]).toMatchObject({ quantity: 3, orderLineId: "l-unit" });
  });
});

describe("giftSetStockHeldForOrder (edit mode: what each set really holds)", () => {
  it("sums the ledger per set and variant; a short set (no write-off) holds nothing", async () => {
    const groupBy = vi.fn(async () => [
      // Set C black ×3: taken 3, returned 3 on an edit, taken 3 again.
      { variantId: "v-black", orderLineId: "box-c1", _sum: { delta: { toString: () => "-3" } } },
      // Set A pen: taken and returned (net 0) → not held.
      { variantId: "v-pen", orderLineId: "pen-a", _sum: { delta: { toString: () => "0" } } },
      { variantId: "v-mug", orderLineId: "mug-a", _sum: { delta: { toString: () => "-1" } } },
    ]);
    const db = {
      orderLine: {
        findMany: vi.fn(async () => [
          { id: "box-c1", setGroupId: "C1", stockVariantId: "v-black", setData: null },
          { id: "box-c2", setGroupId: "C2", stockVariantId: "v-red", setData: null },
          { id: "pen-a", setGroupId: "A1", stockVariantId: "v-pen", setData: null },
          { id: "mug-a", setGroupId: "A1", stockVariantId: "v-mug", setData: null },
        ]),
      },
      stockMovement: { groupBy },
      stockVariant: {
        findMany: vi.fn(async () => [
          { id: "v-black", sku: "GIFT-SET-THERMOS-BLACK" },
          { id: "v-mug", sku: "S3-KJRJ-320" },
        ]),
      },
    } as never;
    const held = await giftSetStockHeldForOrder(db, "o-1");
    expect(held).toEqual([
      { setGroupId: "C1", variantId: "v-black", sku: "GIFT-SET-THERMOS-BLACK", quantity: 3 },
      { setGroupId: "A1", variantId: "v-mug", sku: "S3-KJRJ-320", quantity: 1 },
    ]);
    // Only the set's own items are read (not the inks of the print lines).
    expect((groupBy.mock.calls[0] as unknown as [{ where: { OR: unknown[] } }])[0].where.OR[0]).toEqual({
      variantId: { in: ["v-black", "v-red", "v-pen", "v-mug"] },
    });
  });
});
