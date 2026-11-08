import { describe, expect, it } from "vitest";
import { giftSetBoardFlags, giftSetBoardSkus, procurementVariantIds } from "./giftSetBoard";

const set = (o: Record<string, unknown>) => ({
  version: 1,
  templateId: "t",
  name: "Набор",
  quantity: 2,
  roleLabel: "x",
  ...o,
});

describe("gift set board flags", () => {
  const lines = [
    { id: "a1", setGroupId: "A", setData: set({ kind: "assembled", role: "mug", boxSku: "EW-BOX-300X230X85" }), stockVariantId: "mug" },
    { id: "a2", setGroupId: "A", setData: set({ kind: "assembled", role: "pen", boxSku: null }), stockVariantId: "pen" },
    { id: "c1", setGroupId: "C", setData: set({ kind: "ready", role: "ready", zoneId: "thermos", boxSku: null, setItemSku: "GIFT-SET-THERMOS-BLACK" }), stockVariantId: null },
    { id: "c2", setGroupId: "C", setData: set({ kind: "ready", role: "ready", zoneId: "pen", boxSku: null }), stockVariantId: null },
    { id: "x", setGroupId: null, setData: null, stockVariantId: "pen" },
  ];
  const bySku = new Map([
    ["EW-BOX-300X230X85", "box-v"],
    ["GIFT-SET-THERMOS-BLACK", "set-v"],
  ]);

  it("pack note on every card of a set; «Закупка» on the whole set whose item / box was short", () => {
    expect(giftSetBoardSkus(lines).sort()).toEqual(["EW-BOX-300X230X85", "GIFT-SET-THERMOS-BLACK"]);
    const short = procurementVariantIds(true, [{ kind: "stock_variant", variantId: "set-v", label: "", requestedQty: 2, stockAtOrder: 0 }]);
    const f = giftSetBoardFlags(lines, short, bySku);
    expect(f.get("a1")).toEqual({ packNote: "+ коробка 30×23×8,5", procurement: false });
    expect(f.get("a2")).toEqual({ packNote: "+ коробка 30×23×8,5", procurement: false });
    expect(f.get("c1")).toEqual({ packNote: "в коробке набора", procurement: true });
    expect(f.get("c2")).toEqual({ packNote: "в коробке набора", procurement: true });
    expect(f.has("x")).toBe(false);
    // A short box / component flags set A.
    const boxShort = giftSetBoardFlags(lines, procurementVariantIds(true, { kind: "pen", productId: "pen", requestedQty: 2, stockAtOrder: 0 }), bySku);
    expect(boxShort.get("a1")!.procurement).toBe(true);
    // Order no longer in procurement: nothing.
    expect(procurementVariantIds(false, [{ kind: "stock_variant", variantId: "set-v" }]).size).toBe(0);
  });

  it("new C set: «Закупка» from its stock line (set item short), «в коробке набора» on every card", () => {
    const c = [
      { id: "t", setGroupId: "N", setData: set({ kind: "ready", role: "ready", zoneId: "thermos", boxSku: null }), stockVariantId: null },
      { id: "n", setGroupId: "N", setData: set({ kind: "ready", role: "ready", zoneId: "notebook", boxSku: null }), stockVariantId: null },
      { id: "u", setGroupId: "N", setData: set({ kind: "ready", role: "box", boxSku: "GIFT-SET-THERMOS-RED" }), stockVariantId: "set-red" },
    ];
    expect(giftSetBoardSkus(c)).toEqual(["GIFT-SET-THERMOS-RED"]);
    const short = procurementVariantIds(true, [{ kind: "stock_variant", variantId: "set-red", label: "", requestedQty: 2, stockAtOrder: 0 }]);
    const f = giftSetBoardFlags(c, short, new Map([["GIFT-SET-THERMOS-RED", "set-red"]]));
    expect(f.get("t")).toEqual({ packNote: "в коробке набора", procurement: true });
    expect(f.get("n")).toEqual({ packNote: "в коробке набора", procurement: true });
    const enough = giftSetBoardFlags(c, new Set(), new Map([["GIFT-SET-THERMOS-RED", "set-red"]]));
    expect(enough.get("t")!.procurement).toBe(false);
  });
});
