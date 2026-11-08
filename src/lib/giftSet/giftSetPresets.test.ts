/**
 * Assembled sets as a promo combo (2026-11-09): any mug / notebook / pen in a
 * set row, dissolving on removal / type change, the set price frozen on saved
 * orders, and the set profit breakdown.
 */
import { describe, expect, it } from "vitest";
import type { UvStockItemJson } from "@/lib/uv/dto";
import {
  DEFAULT_GIFT_SET_TEMPLATES,
  giftSetPriceOnSave,
  planGiftSets,
  storedGiftSetPrices,
  type GiftSetPlanLine,
  type GiftSetTemplate,
  type OrderLineSetData,
} from "./giftSet";
import {
  defaultGiftSetChoice,
  dissolveGiftSetAssigns,
  giftSetBoxRows,
  giftSetRowFromLine,
  giftSetRowKeepsSet,
  giftSetRowTotals,
  withGiftSetBoxLines,
  giftSetLineInput,
  type GiftSetRowAssign,
} from "./giftSetWizard";
import {
  computeGiftSetProfits,
  summarizeGiftSetProfits,
  EMPTY_LIVE_UNIT_COSTS,
  type ProfitOrderLineInput,
} from "@/lib/accounting/orderProfit";
import type { ProductionCostsConfig } from "@/lib/accounting/types";

const templates: GiftSetTemplate[] = DEFAULT_GIFT_SET_TEMPLATES.map((t) => structuredClone(t));
const A = templates[0]!;

function item(id: string, sku: string, categoryCode: string, stockQuantity = 5): UvStockItemJson {
  return { id, sku, categoryCode, stockQuantity } as unknown as UvStockItemJson;
}

const gs = (role: GiftSetRowAssign["role"], extra: Partial<GiftSetRowAssign> = {}): GiftSetRowAssign => ({
  groupId: "g1",
  templateId: A.id,
  role,
  quantity: 2,
  manualUnitPriceMdl: null,
  ...extra,
});

describe("assembled set rows take any item of their type", () => {
  it("keeps the set for another SKU of the same type, not for another type or the client's item", () => {
    expect(giftSetRowKeepsSet(gs("mug"), { productType: "mug", stockItem: true })).toBe(true);
    expect(giftSetRowKeepsSet(gs("mug"), { productType: "paper_print", stockItem: false })).toBe(false);
    expect(giftSetRowKeepsSet(gs("pen"), { productType: "notebook", stockItem: true })).toBe(false);
    expect(giftSetRowKeepsSet(gs("mug"), { productType: "mug", stockItem: false })).toBe(false);
    // Ready set rows never take free changes.
    expect(giftSetRowKeepsSet(gs("ready"), { productType: "notebook", stockItem: true })).toBe(false);
  });

  it("starts filled even when no stock item matches the template SKU glob", () => {
    const catalogs = {
      uv: [item("p9", "OTHER_PEN", "pens"), item("n9", "OTHER-NB", "notebooks")],
      sublimation: [item("m9", "OTHER-MUG", "mugs")],
    };
    expect(defaultGiftSetChoice(A, catalogs).variants).toEqual({ mug: "m9", notebook: "n9", pen: "p9" });
  });

  it("the server prices the set the same whatever mug / notebook / pen is picked", () => {
    const line = (productType: string, role: "mug" | "notebook" | "pen" | "box"): GiftSetPlanLine => ({
      productType,
      quantity: 2,
      customerType: "retail",
      set: { groupId: "g1", templateId: A.id, quantity: 2, role },
    });
    const plan = planGiftSets(
      [line("mug", "mug"), line("notebook", "notebook"), line("pen", "pen"), line("set_box", "box")],
      templates,
      { allowManualPrice: true },
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const total = [...plan.byLine.values()].reduce((s, x) => s + x.data.lineTotalMdl, 0);
    expect(total).toBe(449 * 2);
  });
});

describe("removing one item row dissolves the set", () => {
  type Row = { giftSet: GiftSetRowAssign | null; linePriceStr: string; productType: string };
  const assigns: Record<string, Row> = {
    s1: { giftSet: gs("mug"), linePriceStr: "", productType: "mug" },
    s2: { giftSet: gs("notebook"), linePriceStr: "", productType: "notebook" },
    s3: { giftSet: gs("pen"), linePriceStr: "", productType: "pen" },
    other: { giftSet: gs("pen", { groupId: "g2" }), linePriceStr: "", productType: "pen" },
    plain: { giftSet: null, linePriceStr: "55", productType: "paper_print" },
  };

  it("drops the removed row, the rest leave the set at their normal price, other sets stay", () => {
    const next = dissolveGiftSetAssigns(assigns, "g1", "s1");
    expect(Object.keys(next).sort()).toEqual(["other", "plain", "s2", "s3"]);
    expect(next.s2!.giftSet).toBeNull();
    expect(next.s3!.giftSet).toBeNull();
    expect(next.s2!.linePriceStr).toBe("");
    expect(next.other!.giftSet?.groupId).toBe("g2");
    expect(next.plain).toBe(assigns.plain);
  });

  it("no set price, no box row, no box line any more for the dissolved set", () => {
    const next = dissolveGiftSetAssigns(assigns, "g1", "s1");
    const rows = ["s2", "s3", "other"].map((slotId) => ({ slotId, giftSet: next[slotId]!.giftSet }));
    const totals = giftSetRowTotals(rows, templates, "retail", { allowManualPrice: true });
    expect(totals.has("s2")).toBe(false);
    expect(totals.has("s3")).toBe(false);
    const boxes = giftSetBoxRows(rows, templates);
    expect([...boxes.values()].map((b) => b.groupId)).toEqual(["g2"]);
    const lines = withGiftSetBoxLines(
      rows.map((r) => ({ productType: next[r.slotId]!.productType, ...(r.giftSet ? { set: giftSetLineInput(r.giftSet) } : {}) })),
      templates,
    );
    expect(lines.filter((l) => l.productType === "set_box").length).toBe(1);
    expect(lines.filter((l) => l.set?.groupId === "g1").length).toBe(0);
  });

  it("a type change keeps the row (it changes type) but the set still dissolves", () => {
    const next = dissolveGiftSetAssigns(assigns, "g1");
    expect(next.s1!.giftSet).toBeNull();
    expect(next.s2!.giftSet).toBeNull();
  });
});

describe("a saved order keeps its set price when the template price changes", () => {
  const stored: OrderLineSetData = {
    version: 1,
    templateId: A.id,
    name: A.name,
    kind: "assembled",
    role: "mug",
    roleLabel: "Кружка",
    quantity: 2,
    customerType: "retail",
    unitPriceMdl: 449,
    priceSource: "retail",
    lineUnitPriceMdl: 160,
    lineTotalMdl: 320,
    boxSku: null,
  };
  const newSeason = templates.map((t) => (t.id === A.id ? { ...t, retailPriceMdl: 499 } : t));
  const storedPrices = storedGiftSetPrices([
    { setGroupId: "g1", setData: stored },
    { setGroupId: null, setData: null },
  ]);
  const lines = (customerType: "retail" | "dealer" = "retail", manual: number | null = null): GiftSetPlanLine[] =>
    (["mug", "notebook", "pen"] as const)
      .map(
        (role): GiftSetPlanLine => ({
          productType: role,
          quantity: 2,
          customerType,
          set: { groupId: "g1", templateId: A.id, quantity: 2, role, manualUnitPriceMdl: manual },
        }),
      )
      .concat([
        { productType: "set_box", quantity: 2, customerType, set: { groupId: "g1", templateId: A.id, quantity: 2, role: "box" } },
      ]);
  const setTotal = (plan: ReturnType<typeof planGiftSets>): number =>
    plan.ok ? [...plan.byLine.values()].reduce((s, x) => s + x.data.lineTotalMdl, 0) : NaN;

  it("server: an edit saved without touching the set keeps 449", () => {
    const plan = planGiftSets(lines(), newSeason, { allowManualPrice: true, storedPrices });
    expect(setTotal(plan)).toBe(449 * 2);
    if (plan.ok) expect([...plan.byLine.values()][0]!.data.unitPriceMdl).toBe(449);
  });

  it("server: a new order (no stored price) takes the new price", () => {
    expect(setTotal(planGiftSets(lines(), newSeason, { allowManualPrice: true }))).toBe(499 * 2);
  });

  it("server: a new set in the same order, another template or customer type takes today's price", () => {
    const otherGroup = planGiftSets(
      lines().map((l) => ({ ...l, set: { ...l.set!, groupId: "g-new" } })),
      newSeason,
      { allowManualPrice: true, storedPrices },
    );
    expect(setTotal(otherGroup)).toBe(499 * 2);
    expect(giftSetPriceOnSave({ ...A, retailPriceMdl: 499 }, "dealer", null, storedPrices.get("g1"), true).unitPriceMdl).toBe(499);
  });

  it("server: a staff manual price still wins; a dealer edit keeps a staff price", () => {
    expect(setTotal(planGiftSets(lines("retail", 400), newSeason, { allowManualPrice: true, storedPrices }))).toBe(800);
    const manualStored = new Map([["g1", { templateId: A.id, customerType: "dealer" as const, unitPriceMdl: 380, priceSource: "manual" as const }]]);
    expect(setTotal(planGiftSets(lines("dealer"), newSeason, { allowManualPrice: false, storedPrices: manualStored }))).toBe(760);
  });

  it("wizard: the reopened set shows the stored price, the same as the server", () => {
    const row = giftSetRowFromLine("g1", stored, {});
    expect(row.savedPrice?.unitPriceMdl).toBe(449);
    const rows = (["mug", "notebook", "pen"] as const).map((role) => ({ slotId: role, giftSet: { ...row, role } }));
    const totals = giftSetRowTotals(rows, newSeason, "retail", { allowManualPrice: true });
    expect([...totals.values()].reduce((s, x) => s + x, 0)).toBe(449 * 2);
  });
});

describe("set profit breakdown", () => {
  const production: ProductionCostsConfig = {
    mugPrintPerUnit: 10,
    packagingPerOrder: 5,
    otherConsumablesPerOrder: 3,
    inkMlPerSqmLargeFormatRoll: 0,
    minimumOrderPriceMdl: 0,
    lfMinimumLineTotalMdl: 0,
    lfRetailMarkupMultiplier: 0,
    lfDealerMarkupMultiplier: 0,
    lfInkRetailMarkupMultiplier: 0,
    lfInkDealerMarkupMultiplier: 0,
    bcMinimumLineTotalMdl: 0,
  };
  const setData = (role: OrderLineSetData["role"], lineTotalMdl: number, boxSku: string | null = null): OrderLineSetData => ({
    version: 1,
    templateId: A.id,
    name: A.name,
    kind: "assembled",
    role,
    roleLabel: role === "box" ? "Коробка набора" : role === "mug" ? "Кружка" : role === "pen" ? "Ручка" : "Блокнот",
    quantity: 2,
    customerType: "retail",
    unitPriceMdl: 449,
    priceSource: "retail",
    lineUnitPriceMdl: lineTotalMdl / 2,
    lineTotalMdl,
    boxSku,
  });
  const line = (productType: string, stockVariantId: string | null, data: OrderLineSetData): ProfitOrderLineInput => ({
    productType,
    mugProductSnapshot: null,
    notebookProductSnapshot: null,
    penProductSnapshot: null,
    largeFormatLineData: null,
    stockVariantId,
    setGroupId: "g1",
    setData: data,
    files: productType === "set_box" ? [] : [{ copies: 2 }],
  });
  const lines: ProfitOrderLineInput[] = [
    line("mug", "v-mug", setData("mug", 320)),
    line("notebook", "v-nb", setData("notebook", 378)),
    line("pen", "v-pen", setData("pen", 200)),
    line("set_box", null, setData("box", 0, "EW-BOX-300X230X85")),
    { ...line("paper_print", null, setData("mug", 0)), setGroupId: null, setData: null },
  ];
  const costs = new Map<string, number | null>([
    ["v-mug", 40],
    ["v-nb", 60],
    ["v-pen", 8],
  ]);
  const liveCosts = {
    ...EMPTY_LIVE_UNIT_COSTS,
    mug: costs,
    notebook: costs,
    pen: costs,
    uvPrintPerPiece: new Map([
      ["v-nb", 5],
      ["v-pen", 1.5],
    ]),
    giftSetUnitBySku: new Map<string, number | null>([["EW-BOX-300X230X85", 12]]),
  };

  it("set price − each item − its print − box = profit", () => {
    const [p] = computeGiftSetProfits(lines, production, liveCosts);
    expect(p).toBeDefined();
    expect(p!.quantity).toBe(2);
    expect(p!.revenue).toBe(898);
    expect(p!.items.map((i) => [i.label, i.itemCost, i.printCost])).toEqual([
      ["Кружка", 80, 20],
      ["Блокнот", 120, 10],
      ["Ручка", 16, 3],
    ]);
    expect(p!.boxCost).toBe(24);
    expect(p!.totalCost).toBe(80 + 20 + 120 + 10 + 16 + 3 + 24);
    expect(p!.profit).toBe(898 - 273);
    expect(p!.missingCost).toBe(false);
  });

  it("flags a missing purchase cost and sums sets per template", () => {
    const noPen = { ...liveCosts, pen: new Map<string, number | null>([["v-pen", null]]) };
    const sets = computeGiftSetProfits(lines, production, noPen);
    expect(sets[0]!.missingCost).toBe(true);
    const summary = summarizeGiftSetProfits([...computeGiftSetProfits(lines, production, liveCosts), ...computeGiftSetProfits(lines, production, liveCosts)]);
    expect(summary).toEqual([
      { templateId: A.id, name: A.name, sets: 4, revenue: 1796, cost: 546, profit: 1250, missingCost: false },
    ]);
  });

  it("old orders with the box on the first line still count the box", () => {
    const legacy = lines.filter((l) => l.productType !== "set_box").map((l, i) =>
      i === 0 ? { ...l, setData: setData("mug", 320, "EW-BOX-300X230X85") } : l,
    );
    expect(computeGiftSetProfits(legacy, production, liveCosts)[0]!.boxCost).toBe(24);
  });
});
