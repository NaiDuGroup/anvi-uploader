import { describe, expect, it } from "vitest";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { DEFAULT_GIFT_SET_TEMPLATES } from "./giftSet";
import {
  defaultGiftSetChoice,
  giftSetChoiceProblem,
  giftSetComponentOptions,
  giftSetGroupSlotIds,
  giftSetLineInput,
  giftSetReservedStock,
  giftSetRowPlans,
  giftSetShortNames,
  giftSetSwatchHex,
  colourFromName,
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

  it("row totals add up to price × N (assembled and ready split by weight)", () => {
    const g = (groupId: string, templateId: string, role: string, quantity: number, manual: number | null = null, zoneId?: string) => ({
      groupId,
      templateId,
      role: role as "pen",
      quantity,
      manualUnitPriceMdl: manual,
      ...(zoneId ? { zoneId, readyVariantId: "v" } : {}),
    });
    const rows = [
      { slotId: "a", giftSet: g("1", B.id, "notebook", 2) },
      { slotId: "b", giftSet: g("1", B.id, "pen", 2) },
      { slotId: "c", giftSet: g("2", C.id, "ready", 3, null, "thermos") },
      { slotId: "d", giftSet: g("2", C.id, "ready", 3, null, "notebook") },
      { slotId: "f", giftSet: g("2", C.id, "ready", 3, null, "pen") },
      { slotId: "e", giftSet: null },
    ];
    const t = giftSetRowTotals(rows, [A, B, C], "retail", { allowManualPrice: true });
    expect((t.get("a") ?? 0) + (t.get("b") ?? 0)).toBe(598);
    expect([t.get("c"), t.get("d"), t.get("f")]).toEqual([933, 567, 300]);
    expect(t.has("e")).toBe(false);
    rows[0]!.giftSet!.manualUnitPriceMdl = 250;
    const manual = giftSetRowTotals(rows, [A, B, C], "retail", { allowManualPrice: true });
    expect((manual.get("a") ?? 0) + (manual.get("b") ?? 0)).toBe(500);
    const dealer = giftSetRowTotals(rows, [A, B, C], "dealer", { allowManualPrice: false });
    expect((dealer.get("a") ?? 0) + (dealer.get("b") ?? 0)).toBe(598);
    expect(giftSetGroupSlotIds("b", rows)).toEqual(["a", "b"]);
    expect(giftSetLineInput(rows[2]!.giftSet!)).toMatchObject({ role: "ready", zoneId: "thermos", readyVariantId: "v" });
    expect(giftSetGroupSlotIds("e", rows)).toEqual(["e"]);
  });

  it("stock the unsaved order already takes: other sets / rows, boxes once per set, the edited saved set back", () => {
    const gs = (groupId: string, templateId: string, role: string, quantity: number, readyVariantId?: string) => ({
      groupId,
      templateId,
      role: role as "pen",
      quantity,
      manualUnitPriceMdl: null,
      ...(readyVariantId ? { zoneId: "thermos", readyVariantId } : {}),
    });
    const rows = [
      // Set A ×2 (new): mug, notebook, pen + one box per set.
      { slotId: "1", giftSet: gs("A1", A.id, "mug", 2), variantId: "mug-red", quantity: 2, saved: false },
      { slotId: "2", giftSet: gs("A1", A.id, "notebook", 2), variantId: "nb-blue", quantity: 2, saved: false },
      { slotId: "3", giftSet: gs("A1", A.id, "pen", 2), variantId: "pen-blue", quantity: 2, saved: false },
      // A loose pen row.
      { slotId: "4", giftSet: null, variantId: "pen-blue", quantity: 5, saved: false },
      // Set C ×1: three rows, one set item.
      { slotId: "5", giftSet: gs("C1", C.id, "ready", 1, "set-black"), variantId: null, quantity: 1, saved: false },
      { slotId: "6", giftSet: gs("C1", C.id, "ready", 1, "set-black"), variantId: null, quantity: 1, saved: false },
      // A saved row: already off the stock.
      { slotId: "7", giftSet: null, variantId: "nb-blue", quantity: 9, saved: true },
    ];
    const r = giftSetReservedStock(rows, [A, B, C], null);
    expect(r.get("mug-red")).toBe(2);
    expect(r.get("nb-blue")).toBe(2);
    expect(r.get("pen-blue")).toBe(7);
    expect(r.get(`box:${A.boxSku}`)).toBe(2);
    expect(r.get("set-black")).toBe(1);
    // Editing set A: its own rows do not count.
    const editA = giftSetReservedStock(rows, [A, B, C], "A1");
    expect(editA.get("mug-red")).toBeUndefined();
    expect(editA.get(`box:${A.boxSku}`)).toBeUndefined();
    expect(editA.get("pen-blue")).toBe(5);
    // Editing a saved set: its stock comes back.
    const saved = rows.map((x) => (x.giftSet?.groupId === "A1" ? { ...x, saved: true } : x));
    const back = giftSetReservedStock(saved, [A, B, C], "A1");
    expect(back.get("mug-red")).toBe(-2);
    expect(back.get(`box:${A.boxSku}`)).toBe(-2);
  });

  it("swatch colours from hex / name; short option names", () => {
    const v = (id: string, ru: string, colorHex: string | null, variantLabel: string | null = null) => ({
      id,
      name: ru,
      itemNames: { ru, ro: ru, en: ru },
      variantLabel,
      colorHex,
    });
    // Pens: every body hex is the default black → the name decides.
    expect(giftSetSwatchHex(v("p1", "Ручка белая", "#1f1f1f"))).toBe("#ffffff");
    expect(giftSetSwatchHex(v("p2", "Ручка синяя", "#1f1f1f"))).toBe("#1d4ed8");
    expect(giftSetSwatchHex(v("p3", "Ручка зеленая", "#1f1f1f"))).toBe("#16a34a");
    expect(giftSetSwatchHex(v("p4", "Ручка чёрная", "#1f1f1f"))).toBe("#1f1f1f");
    // Mugs: white body, colour inside → the name.
    expect(giftSetSwatchHex(v("m1", "Кружка цветная внутри и ручка 330 мл — красная", "#ffffff"))).toBe("#dc2626");
    expect(giftSetSwatchHex(v("m2", "Кружка цветная внутри и ручка 330 мл — желтая", "#ffffff"))).toBe("#facc15");
    expect(giftSetSwatchHex(v("m3", "Кружка цветная внутри и ручка 330 мл — оранжевая", "#ffffff"))).toBe("#f97316");
    expect(giftSetSwatchHex(v("m4", "Кружка — розовая", "#ffffff"))).toBe("#f472b6");
    // Notebooks: a real cover colour wins.
    expect(giftSetSwatchHex(v("n1", "Синий Блокнот A5", "#17579a"))).toBe("#17579a");
    // Ready set variants: label.
    expect(giftSetSwatchHex(v("s1", "Набор", null, "золотой"))).toBe("#c9a227");
    expect(giftSetSwatchHex(v("s2", "Набор", null, "серый"))).toBe("#9ca3af");
    expect(giftSetSwatchHex(v("x", "Что-то", null))).toBe("#e5e7eb");
    expect(colourFromName("Серебристая ручка")).toBe("#c0c0c0");

    const mugs = [
      v("m1", "Кружка цветная внутри и ручка 330 мл — красная", "#ffffff"),
      v("m2", "Кружка цветная внутри и ручка 330 мл — синяя", "#ffffff"),
    ];
    expect([...giftSetShortNames(mugs).values()]).toEqual(["красная", "синяя"]);
    expect([...giftSetShortNames([v("p1", "Ручка белая", null), v("p2", "Ручка синяя", null)]).values()]).toEqual(["белая", "синяя"]);
    expect([...giftSetShortNames([v("s1", "Набор", null, "чёрный")]).values()]).toEqual(["чёрный"]);
  });
});
