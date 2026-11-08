import { describe, expect, it } from "vitest";
import {
  DEFAULT_GIFT_SET_TEMPLATES,
  boxSizeFromSku,
  giftSetBoxWriteOffs,
  giftSetPackNote,
  giftSetUnitPrice,
  isLegacyReadySetLine,
  parseGiftSetTemplates,
  parseOrderLineSetData,
  planGiftSets,
  skuMatches,
  splitSetUnitPrice,
  templatesWithoutDealerPrice,
  validateGiftSetTemplates,
  type GiftSetPlanLine,
} from "./giftSet";

const templates = DEFAULT_GIFT_SET_TEMPLATES.map((t) => structuredClone(t));
const sum = (xs: number[]): number => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

describe("splitSetUnitPrice", () => {
  it("splits 449 by the retail prices exactly (mug 160, notebook 189, pen 100)", () => {
    expect(splitSetUnitPrice(449, [160, 189, 100])).toEqual([160, 189, 100]);
  });
  it("keeps whole lei and the exact sum for any whole price", () => {
    for (const p of [299, 300, 301, 1, 2, 999]) {
      const s = splitSetUnitPrice(p, [160, 189, 100]);
      expect(sum(s)).toBe(p);
      s.forEach((x) => expect(Number.isInteger(x)).toBe(true));
    }
  });
  it("splits a price with bani in bani", () => {
    const s = splitSetUnitPrice(299.99, [189, 100]);
    expect(sum(s)).toBe(299.99);
    expect(s[0]! > s[1]!).toBe(true);
  });
  it("gives the remainder to the heaviest line and splits evenly without weights", () => {
    expect(splitSetUnitPrice(10, [1, 2])).toEqual([3, 7]);
    expect(splitSetUnitPrice(10, [0, 0, 0])).toEqual([4, 3, 3]);
  });
});

describe("giftSetUnitPrice", () => {
  const t = { retailPriceMdl: 449, dealerPriceMdl: 350 };
  it("retail / dealer / manual", () => {
    expect(giftSetUnitPrice(t, "retail")).toEqual({ unitPriceMdl: 449, source: "retail" });
    expect(giftSetUnitPrice(t, "dealer")).toEqual({ unitPriceMdl: 350, source: "dealer" });
    expect(giftSetUnitPrice(t, "dealer", 400)).toEqual({ unitPriceMdl: 400, source: "manual" });
  });
  it("dealer falls back to retail when no dealer price", () => {
    expect(giftSetUnitPrice({ retailPriceMdl: 600, dealerPriceMdl: null }, "dealer")).toEqual({
      unitPriceMdl: 600,
      source: "retail",
    });
  });
});

describe("validateGiftSetTemplates", () => {
  it("accepts the defaults", () => {
    const r = validateGiftSetTemplates(templates);
    expect(r.ok).toBe(true);
  });
  it("rejects bad entries with their index", () => {
    const r = validateGiftSetTemplates([
      templates[0],
      { ...templates[1], id: templates[0]!.id },
      { ...templates[2], zones: [] },
      { ...templates[0], id: "x", retailPriceMdl: 0 },
      { ...templates[0], id: "y", components: [templates[0]!.components[0], templates[0]!.components[0]] },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      { index: 1, issue: "id_duplicate" },
      { index: 2, issue: "zones_required" },
      { index: 3, issue: "retail_price_invalid" },
      { index: 4, issue: "component_role_duplicate" },
    ]);
  });
  it("normalises an empty dealer price to null and strings to numbers", () => {
    const r = validateGiftSetTemplates([{ ...templates[1], dealerPriceMdl: "", retailPriceMdl: "299,5" }]);
    expect(r.ok && r.templates[0]!.dealerPriceMdl).toBe(null);
    expect(r.ok && r.templates[0]!.retailPriceMdl).toBe(299.5);
  });
  it("parse: null → defaults, broken entries dropped", () => {
    expect(parseGiftSetTemplates(null).map((t) => t.id)).toEqual(["pen_notebook_mug", "pen_notebook", "pen_notebook_thermos"]);
    expect(parseGiftSetTemplates([templates[1], { id: "" }]).map((t) => t.id)).toEqual(["pen_notebook"]);
  });
  it("warns about templates without a dealer price", () => {
    expect(templatesWithoutDealerPrice(templates)).toHaveLength(3);
    expect(templatesWithoutDealerPrice([{ ...templates[0]!, dealerPriceMdl: 300 }])).toHaveLength(0);
  });
});

describe("skuMatches", () => {
  it("globs", () => {
    expect(skuMatches("ARDENES_*", "ARDENES_BLUE")).toBe(true);
    expect(skuMatches("S3-*-A5", "S3-KBL-A5")).toBe(true);
    expect(skuMatches("S3-*-A5", "S3-KBL-A4")).toBe(false);
    expect(skuMatches("S3-K*-3*", "S3-KKRK-330")).toBe(true);
    expect(skuMatches("S3-K*-3*", "S3-KB-450")).toBe(false);
    expect(skuMatches("", "anything")).toBe(true);
  });
});

function setLine(
  productType: string,
  role: GiftSetPlanLine["set"] extends infer S ? (S extends { role: infer R } ? R : never) : never,
  quantity: number,
  extra: Partial<GiftSetPlanLine> = {},
  templateId = "pen_notebook_mug",
): GiftSetPlanLine {
  return {
    productType,
    quantity,
    customerType: "retail",
    set: { groupId: "g1", templateId, quantity, role },
    ...extra,
  };
}

describe("planGiftSets", () => {
  it("prices an assembled set: lines add up to price × N, box on the first line", () => {
    const lines = [
      { productType: "paper_print", set: null, quantity: 5, customerType: "retail" as const },
      setLine("mug", "mug", 3),
      setLine("notebook", "notebook", 3),
      setLine("pen", "pen", 3),
    ];
    const plan = planGiftSets(lines, templates, { allowManualPrice: true });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.byLine.has(0)).toBe(false);
    const d = [1, 2, 3].map((i) => plan.byLine.get(i)!.data);
    expect(sum(d.map((x) => x.lineTotalMdl))).toBe(449 * 3);
    expect(d.map((x) => x.lineUnitPriceMdl)).toEqual([160, 189, 100]);
    expect(d.map((x) => x.boxSku)).toEqual(["EW-BOX-300X230X85", null, null]);
    expect(giftSetBoxWriteOffs(d)).toEqual([{ sku: "EW-BOX-300X230X85", quantity: 3 }]);
  });

  it("dealer price, manual only for staff", () => {
    const t = templates.map((x) => (x.id === "pen_notebook" ? { ...x, dealerPriceMdl: 200 } : x));
    const lines = [
      setLine("notebook", "notebook", 2, { customerType: "dealer" }, "pen_notebook"),
      setLine("pen", "pen", 2, { customerType: "dealer" }, "pen_notebook"),
    ];
    lines[0]!.set!.manualUnitPriceMdl = 150;
    const dealer = planGiftSets(lines, t, { allowManualPrice: false });
    expect(dealer.ok && sum([...dealer.byLine.values()].map((v) => v.data.lineTotalMdl))).toBe(400);
    const staff = planGiftSets(lines, t, { allowManualPrice: true });
    expect(staff.ok && sum([...staff.byLine.values()].map((v) => v.data.lineTotalMdl))).toBe(300);
    expect(staff.ok && staff.byLine.get(0)!.data.priceSource).toBe("manual");
  });

  it("refuses a group missing a component, wrong quantity, wrong type or «other» item", () => {
    const missing = planGiftSets([setLine("mug", "mug", 1), setLine("pen", "pen", 1)], templates, { allowManualPrice: false });
    expect(missing).toMatchObject({ ok: false, code: "gift_set_components_mismatch" });
    const qty = planGiftSets(
      [setLine("mug", "mug", 2), setLine("notebook", "notebook", 2), { ...setLine("pen", "pen", 2), quantity: 1 }],
      templates,
      { allowManualPrice: false },
    );
    expect(qty).toMatchObject({ ok: false, code: "gift_set_quantity_mismatch" });
    const type = planGiftSets(
      [setLine("mug", "mug", 1), setLine("notebook", "notebook", 1), setLine("paper_print", "pen", 1)],
      templates,
      { allowManualPrice: false },
    );
    expect(type).toMatchObject({ ok: false, code: "gift_set_line_type_mismatch" });
    const other = planGiftSets(
      [setLine("mug", "mug", 1, { otherItem: true }), setLine("notebook", "notebook", 1), setLine("pen", "pen", 1)],
      templates,
      { allowManualPrice: false },
    );
    expect(other).toMatchObject({ ok: false, code: "gift_set_other_item" });
    const unknown = planGiftSets([setLine("pen", "pen", 1, {}, "nope")], templates, { allowManualPrice: false });
    expect(unknown).toMatchObject({ ok: false, code: "gift_set_template_unknown" });
  });

  it("splits a ready set (C) into thermos / notebook / pen lines; the set item once, on the first line", () => {
    const VAR = "11111111-1111-4111-8111-111111111111";
    const c = (productType: string, zoneId: string, extra: Partial<GiftSetPlanLine> = {}): GiftSetPlanLine => ({
      productType,
      quantity: 4,
      customerType: "retail",
      set: { groupId: "g1", templateId: "pen_notebook_thermos", quantity: 4, role: "ready", zoneId, readyVariantId: VAR },
      readyItemSku: "GIFT-SET-THERMOS",
      readyVariantSku: "GIFT-SET-THERMOS-BLACK",
      readyColourLabel: "чёрный",
      otherItem: productType !== "uv_print",
      ...extra,
    });
    const ok = planGiftSets([c("uv_print", "thermos"), c("notebook", "notebook"), c("pen", "pen")], templates, {
      allowManualPrice: false,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const d = [0, 1, 2].map((i) => ok.byLine.get(i)!.data);
    expect(d.map((x) => x.lineUnitPriceMdl)).toEqual([311, 189, 100]);
    expect(d.reduce((sum, x) => sum + x.lineTotalMdl, 0)).toBe(2400);
    expect(d.map((x) => x.setItemSku ?? null)).toEqual(["GIFT-SET-THERMOS-BLACK", null, null]);
    expect(d.map((x) => x.zoneId)).toEqual(["thermos", "notebook", "pen"]);
    expect(d.map((x) => x.roleLabel)).toEqual(["Термос", "Блокнот", "Ручка"]);
    expect(giftSetBoxWriteOffs(d)).toEqual([{ sku: "GIFT-SET-THERMOS-BLACK", quantity: 4 }]);
    // Odd manual price: still exact.
    const manual = planGiftSets(
      [c("uv_print", "thermos", { set: { ...c("uv_print", "thermos").set!, manualUnitPriceMdl: 555 } }), c("notebook", "notebook"), c("pen", "pen")],
      templates,
      { allowManualPrice: true },
    );
    expect(manual.ok && [0, 1, 2].reduce((sum, i) => sum + manual.byLine.get(i)!.data.lineUnitPriceMdl, 0)).toBe(555);

    expect(planGiftSets([c("uv_print", "thermos"), c("notebook", "notebook")], templates, { allowManualPrice: false })).toMatchObject({
      ok: false,
      code: "gift_set_components_mismatch",
    });
    expect(
      planGiftSets([c("uv_print", "thermos"), c("uv_print", "notebook"), c("pen", "pen")], templates, { allowManualPrice: false }),
    ).toMatchObject({ ok: false, code: "gift_set_line_type_mismatch" });
    // Our stock notebook in a ready set would be written off twice.
    expect(
      planGiftSets([c("uv_print", "thermos"), c("notebook", "notebook", { otherItem: false }), c("pen", "pen")], templates, {
        allowManualPrice: false,
      }),
    ).toMatchObject({ ok: false, code: "gift_set_item_mismatch" });
    expect(
      planGiftSets(
        [c("uv_print", "thermos", { readyItemSku: "ARDENES" }), c("notebook", "notebook"), c("pen", "pen")],
        templates,
        { allowManualPrice: false },
      ),
    ).toMatchObject({ ok: false, code: "gift_set_item_mismatch" });
    // The old one-line format is no longer accepted.
    expect(
      planGiftSets([setLine("uv_print", "ready", 4, { readyItemSku: "GIFT-SET-THERMOS" }, "pen_notebook_thermos")], templates, {
        allowManualPrice: false,
      }),
    ).toMatchObject({ ok: false });
    expect(isLegacyReadySetLine({ role: "ready" })).toBe(true);
    expect(isLegacyReadySetLine(d[0])).toBe(false);
  });

  it("zone weights default by id; pack notes and box sizes", () => {
    const res = validateGiftSetTemplates([
      { id: "c", name: "C", kind: "ready", retailPriceMdl: 600, readyItemSku: "X", zones: [{ id: "thermos", label: "Т", widthCm: 1, heightCm: 1 }] },
    ]);
    expect(res.ok && res.templates[0]!.zones[0]!.weight).toBe(311);
    expect(boxSizeFromSku("EW-BOX-300X230X85")).toBe("30×23×8,5");
    expect(boxSizeFromSku("EW-BOX-215X200X30")).toBe("21,5×20×3");
    expect(giftSetPackNote("assembled", "EW-BOX-300X230X85")).toBe("+ коробка 30×23×8,5");
    expect(giftSetPackNote("assembled", "BOX")).toBe("+ коробка BOX");
    expect(giftSetPackNote("assembled", null)).toBe(null);
    expect(giftSetPackNote("ready", null)).toBe("в коробке набора");
  });

  it("round-trips set data", () => {
    const plan = planGiftSets([setLine("mug", "mug", 1), setLine("notebook", "notebook", 1), setLine("pen", "pen", 1)], templates, {
      allowManualPrice: false,
    });
    const d = plan.ok ? plan.byLine.get(0)!.data : null;
    expect(parseOrderLineSetData(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(parseOrderLineSetData({})).toBe(null);
  });
});
