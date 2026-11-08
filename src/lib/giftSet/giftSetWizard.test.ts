import { describe, expect, it } from "vitest";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { DEFAULT_GIFT_SET_TEMPLATES } from "./giftSet";
import {
  defaultGiftSetChoice,
  giftSetChoiceProblem,
  giftSetComponentOptions,
  giftSetGroupSlotIds,
  giftSetRowPlans,
  giftSetRowTotals,
  readyGiftSetVariants,
} from "./giftSetWizard";

const [A, B, C] = DEFAULT_GIFT_SET_TEMPLATES.map((t) => structuredClone(t)) as [
  (typeof DEFAULT_GIFT_SET_TEMPLATES)[number],
  (typeof DEFAULT_GIFT_SET_TEMPLATES)[number],
  (typeof DEFAULT_GIFT_SET_TEMPLATES)[number],
];

function item(id: string, sku: string, categoryCode: string, stockQuantity = 5): UvStockItemJson {
  return { id, sku, categoryCode, stockQuantity } as unknown as UvStockItemJson;
}

const catalogs = {
  uv: [
    item("p0", "ARDENES_BLACK", "pens", 0),
    item("p1", "ARDENES_BLUE", "pens"),
    item("px", "KIOTO_SET", "pens"),
    item("n1", "S3-KBL-A5", "notebooks"),
    item("c1", "GIFT-SET-THERMOS-BLACK", "gift_sets", 0),
    item("c2", "GIFT-SET-THERMOS-RED", "gift_sets"),
  ],
  sublimation: [item("m1", "S3-KKRK-330", "mugs"), item("m2", "S3-KB-450", "mugs")],
};

describe("gift set wizard", () => {
  it("offers the role's variants matching the template SKU glob", () => {
    expect(giftSetComponentOptions(A, "pen", catalogs).map((i) => i.id)).toEqual(["p0", "p1"]);
    expect(giftSetComponentOptions(A, "mug", catalogs).map((i) => i.id)).toEqual(["m1"]);
    expect(readyGiftSetVariants(C, catalogs.uv).map((i) => i.id)).toEqual(["c1", "c2"]);
  });

  it("defaults to in-stock variants and builds the rows", () => {
    const choice = defaultGiftSetChoice(A, catalogs);
    expect(choice.variants).toEqual({ mug: "m1", notebook: "n1", pen: "p1" });
    expect(giftSetChoiceProblem(A, choice)).toBe(null);
    expect(giftSetRowPlans(A, choice).map((r) => [r.productType, r.method, r.variantId])).toEqual([
      ["mug", "sublimation_print", "m1"],
      ["notebook", "uv_print", "n1"],
      ["pen", "uv_print", "p1"],
    ]);
    const ready = defaultGiftSetChoice(C, catalogs);
    expect(ready.readyVariantId).toBe("c2");
    expect(giftSetRowPlans(C, ready).map((r) => r.zoneId)).toEqual(["thermos", "notebook", "pen"]);
    expect(giftSetChoiceProblem(C, { ...ready, readyVariantId: null })).toBe("ready_item_missing");
  });

  it("row totals add up to price × N (assembled split, ready on the first row)", () => {
    const g = (groupId: string, templateId: string, role: string, quantity: number, manual: number | null = null) => ({
      groupId,
      templateId,
      role: role as "pen",
      quantity,
      manualUnitPriceMdl: manual,
    });
    const rows = [
      { slotId: "a", giftSet: g("1", B.id, "notebook", 2) },
      { slotId: "b", giftSet: g("1", B.id, "pen", 2) },
      { slotId: "c", giftSet: g("2", C.id, "ready", 3) },
      { slotId: "d", giftSet: g("2", C.id, "ready", 3) },
      { slotId: "e", giftSet: null },
    ];
    const t = giftSetRowTotals(rows, [A, B, C], "retail", { allowManualPrice: true });
    expect((t.get("a") ?? 0) + (t.get("b") ?? 0)).toBe(598);
    expect(t.get("c")).toBe(1800);
    expect(t.get("d")).toBe(0);
    expect(t.has("e")).toBe(false);
    rows[0]!.giftSet!.manualUnitPriceMdl = 250;
    const manual = giftSetRowTotals(rows, [A, B, C], "retail", { allowManualPrice: true });
    expect((manual.get("a") ?? 0) + (manual.get("b") ?? 0)).toBe(500);
    const dealer = giftSetRowTotals(rows, [A, B, C], "dealer", { allowManualPrice: false });
    expect((dealer.get("a") ?? 0) + (dealer.get("b") ?? 0)).toBe(598);
    expect(giftSetGroupSlotIds("b", rows)).toEqual(["a", "b"]);
    expect(giftSetGroupSlotIds("e", rows)).toEqual(["e"]);
  });
});
