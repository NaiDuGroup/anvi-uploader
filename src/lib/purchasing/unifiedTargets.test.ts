import { describe, it, expect } from "vitest";
import {
  isLegacyKind,
  isPostableKind,
  isStockTargetKind,
  LEGACY_STOCK_TARGET_KINDS,
  pickLocalized,
  purchaseUnitAllowsFractions,
  purchaseUnitFromStockUnit,
  stockQuantityFromInvoice,
  StockTargetKind,
  targetStockUnit,
  unifiedVariantLabel,
  type StockTargetOption,
} from "./types";
import {
  choiceForTarget,
  defaultWarehouseChoice,
  localizedUnifiedLabel,
  optionsForChoice,
  parseChoice,
  unifiedChoice,
  unifiedGroups,
  warehouseChoices,
} from "./targetChoices";
import { rankStockTargets, suggestUnitsPerInvoiceUnit } from "./suggestMapping";
import { UnifiedUnpostAction, unpostActionFor } from "./unifiedStockTarget";

const SOCKS = {
  id: "cat-socks",
  names: { ro: "Șosete", ru: "Носки", en: "Socks" },
  sortOrder: 20,
};
const BODY = {
  id: "cat-body",
  names: { ro: "Body", ru: "Боди", en: "Bodysuits" },
  sortOrder: 10,
};

function unifiedOption(
  id: string,
  group: typeof SOCKS,
  item: string,
  label: string | null,
  sku: string,
  unit: StockTargetOption["unit"] = "pcs",
): StockTargetOption {
  return {
    kind: StockTargetKind.StockVariant,
    id,
    name: unifiedVariantLabel(item, label, sku),
    widthMeters: null,
    unit,
    unified: {
      group,
      itemNames: { ro: item, ru: `${item} RU`, en: `${item} EN` },
      variantLabel: label,
      sku,
    },
  };
}

const sockBlackM = unifiedOption("v1", SOCKS, "Sosete bumbac", "negru / M", "SOCK-BLK-M");
const sockWhiteL = unifiedOption("v2", SOCKS, "Sosete bumbac", "alb / L", "SOCK-WHT-L");
const body = unifiedOption("v3", BODY, "Body bebe", null, "BODY-1");
const mug: StockTargetOption = { kind: StockTargetKind.Mug, id: "m1", name: "Cana alba", widthMeters: null };
const targets: StockTargetOption[] = [mug, sockBlackM, sockWhiteL, body];

describe("stock_variant kind", () => {
  it("is a postable, non-legacy kind", () => {
    expect(isStockTargetKind("stock_variant")).toBe(true);
    expect(isPostableKind(StockTargetKind.StockVariant)).toBe(true);
    expect(isLegacyKind(StockTargetKind.StockVariant)).toBe(false);
    expect(isLegacyKind(StockTargetKind.Garment)).toBe(true);
    expect(LEGACY_STOCK_TARGET_KINDS).not.toContain(StockTargetKind.StockVariant);
    expect(LEGACY_STOCK_TARGET_KINDS).toContain(StockTargetKind.Ignore);
  });

  it("maps category units to purchase units", () => {
    expect(purchaseUnitFromStockUnit("pcs")).toBe("pcs");
    expect(purchaseUnitFromStockUnit("m")).toBe("lm");
    expect(purchaseUnitFromStockUnit("sheet")).toBe("sheets");
    expect(purchaseUnitFromStockUnit("ml")).toBe("ml");
    expect(purchaseUnitFromStockUnit("g")).toBe("g");
    expect(purchaseUnitAllowsFractions("pcs")).toBe(false);
    expect(purchaseUnitAllowsFractions("lm")).toBe(true);
  });

  it("keeps 3 decimals of quantity and takes the unit from the option", () => {
    expect(stockQuantityFromInvoice(StockTargetKind.StockVariant, 12, 1)).toBe(12);
    expect(stockQuantityFromInvoice(StockTargetKind.StockVariant, 3, 0.3333)).toBe(1);
    expect(stockQuantityFromInvoice(StockTargetKind.StockVariant, 2.5, 1)).toBe(2.5);
    expect(targetStockUnit(StockTargetKind.StockVariant, { unit: "lm" })).toBe("lm");
    expect(targetStockUnit(StockTargetKind.StockVariant, undefined)).toBe("pcs");
    expect(targetStockUnit(StockTargetKind.Ink, undefined)).toBe("ml");
  });
});

describe("unified option labels", () => {
  it("formats «Item — variant (SKU)» and drops an empty label", () => {
    expect(unifiedVariantLabel("Sosete", "negru / M", "S-1")).toBe("Sosete — negru / M (S-1)");
    expect(unifiedVariantLabel("Cana", null, "C-1")).toBe("Cana (C-1)");
    expect(unifiedVariantLabel("Cana", "  ", "C-1")).toBe("Cana (C-1)");
  });

  it("localizes item and category names", () => {
    expect(localizedUnifiedLabel(sockBlackM, "ru")).toBe("Sosete bumbac RU — negru / M (SOCK-BLK-M)");
    expect(localizedUnifiedLabel(sockBlackM, "ro")).toBe("Sosete bumbac — negru / M (SOCK-BLK-M)");
    expect(localizedUnifiedLabel(mug, "ru")).toBe("Cana alba");
    expect(pickLocalized(SOCKS.names, "en")).toBe("Socks");
    expect(pickLocalized(SOCKS.names, "xx")).toBe("Șosete");
  });
});

describe("warehouse choices", () => {
  it("parses legacy kinds and unified categories", () => {
    expect(parseChoice("mug")).toEqual({ kind: StockTargetKind.Mug, groupId: null });
    expect(parseChoice(unifiedChoice("cat-socks"))).toEqual({
      kind: StockTargetKind.StockVariant,
      groupId: "cat-socks",
    });
    expect(parseChoice("stock_variant")).toBeNull();
    expect(parseChoice("stock_variant:")).toBeNull();
    expect(parseChoice("nope")).toBeNull();
  });

  it("lists legacy kinds, then categories by sort order, then «ignore»", () => {
    const entries = warehouseChoices(targets, "ru", (k) => `kind:${k}`);
    const values = entries.map((e) => e.value);
    // Every legacy kind is retired now: only unified categories and «ignore» are offered.
    expect(values).toEqual([unifiedChoice("cat-body"), unifiedChoice("cat-socks"), "ignore"]);
    // Roll media and sheet paper are posted to «Широкоформатные материалы» / «Листовая бумага».
    expect(values).not.toContain(StockTargetKind.LfMaterial);
    expect(values).not.toContain(StockTargetKind.SheetPaper);
    // Mugs are retired: posted to the unified «Кружки» category.
    expect(values).not.toContain(StockTargetKind.Mug);
    expect(values.at(-1)).toBe("ignore");
    expect(values.slice(-3, -1)).toEqual([unifiedChoice("cat-body"), unifiedChoice("cat-socks")]);
    expect(entries.find((e) => e.value === unifiedChoice("cat-socks"))?.label).toBe("Носки");
    expect(values).not.toContain("stock_variant");
    // Pens are retired: posted to the unified «Ручки» category.
    expect(values).not.toContain(StockTargetKind.Pen);
    // Legacy DTF garments are retired: apparel goes to unified categories.
    expect(values).not.toContain(StockTargetKind.Garment);
    // Printer consumables are posted to «Чернила» / «Тонер» / «Плёнка DTF» / «Порошок DTF».
    expect(values).not.toContain(StockTargetKind.Ink);
    expect(values).not.toContain(StockTargetKind.DtfFilm);
    expect(values).not.toContain(StockTargetKind.DtfPowder);
    expect(unifiedGroups(targets, "ro").map((g) => g.id)).toEqual(["cat-body", "cat-socks"]);
  });

  it("filters the item list by category and resolves a saved target to its category", () => {
    expect(optionsForChoice(targets, unifiedChoice("cat-socks")).map((o) => o.id)).toEqual(["v1", "v2"]);
    expect(optionsForChoice(targets, "mug").map((o) => o.id)).toEqual(["m1"]);
    expect(optionsForChoice(targets, "garbage")).toEqual([]);
    expect(choiceForTarget(StockTargetKind.StockVariant, "v2", targets)).toBe(unifiedChoice("cat-socks"));
    expect(choiceForTarget(StockTargetKind.Pen, "p1", targets)).toBe("pen");
    expect(choiceForTarget(StockTargetKind.StockVariant, "gone", targets)).toBe("ignore");
  });
});

describe("mapping suggestions for unified stock", () => {
  it("picks factor rules by category unit", () => {
    const k = StockTargetKind.StockVariant;
    expect(suggestUnitsPerInvoiceUnit(k, "Sosete negre M", "pereche")).toBe(1);
    expect(suggestUnitsPerInvoiceUnit(k, "Sosete set 12 buc", "set")).toBe(12);
    expect(suggestUnitsPerInvoiceUnit(k, "Banner 1.37*50m", "buc", "lm")).toBe(50);
    expect(suggestUnitsPerInvoiceUnit(k, "Hartie A4 500 coli", "pac", "sheets")).toBe(500);
    expect(suggestUnitsPerInvoiceUnit(k, "Toner Cyan 1L", "buc", "ml")).toBe(1000);
    expect(suggestUnitsPerInvoiceUnit(k, "Pudra 2kg", "buc", "g")).toBe(2000);
    expect(suggestUnitsPerInvoiceUnit(k, "Pudra", "buc", "g")).toBe(1);
  });

  it("ranks unified variants by their name", () => {
    const ranked = rankStockTargets("Sosete bumbac negru M", targets);
    expect(ranked[0]?.id).toBe("v1");
    expect(ranked[0]?.kind).toBe(StockTargetKind.StockVariant);
  });
});

describe("un-posting unified receipts", () => {
  const postedAt = new Date("2026-10-25T12:00:00Z");
  it("reverses receipts created by the posting and detaches older hand-entered ones", () => {
    expect(unpostActionFor(null, postedAt)).toBe(UnifiedUnpostAction.None);
    expect(unpostActionFor({ createdAt: new Date("2026-10-25T11:59:59Z") }, postedAt)).toBe(
      UnifiedUnpostAction.Reversed,
    );
    expect(unpostActionFor({ createdAt: new Date("2026-10-20T09:00:00Z") }, postedAt)).toBe(
      UnifiedUnpostAction.Unlinked,
    );
  });
});

describe("roll media and sheet paper on the unified stock (stage 4)", () => {
  const ROLLS = { id: "cat-rolls", names: { ro: "Materiale", ru: "Широкоформатные материалы", en: "Rolls" }, sortOrder: 50 };
  const PAPER = { id: "cat-paper", names: { ro: "Hârtie", ru: "Листовая бумага", en: "Paper" }, sortOrder: 60 };
  const roll: StockTargetOption = {
    ...unifiedOption("v-roll", ROLLS, "ORACAL MATT 1.27*50m", null, "ROLL-ED16FE76", "lm"),
    widthMeters: 1.27,
  };
  const paper = unifiedOption("v-paper", PAPER, "A4+ 300gr", null, "PAPER-C33D4C91", "sheets");

  it("suggests the roll length as metres per invoice roll for a roll-media variant (unit m)", () => {
    expect(purchaseUnitFromStockUnit("m")).toBe("lm");
    expect(
      suggestUnitsPerInvoiceUnit(StockTargetKind.StockVariant, '380g Cotton Canvas Matte 1.07x30mx3"', "buc", "lm"),
    ).toBe(30);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.StockVariant, "ORACAL MATT 1,27*50m", "m", "lm")).toBe(1);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.StockVariant, "Hartie SRA3 300g 125 coli", "pac", "sheets")).toBe(125);
  });

  it("ranks a roll variant by width like the old lf_material options", () => {
    const ranked = rankStockTargets("ORACAL MATT 1.27*50m", [paper, roll]);
    expect(ranked[0]?.id).toBe("v-roll");
  });

  it("defaults an unsuggested line to the roll-media category", () => {
    expect(defaultWarehouseChoice([paper, roll], "ru")).toBe(unifiedChoice("cat-rolls"));
    expect(defaultWarehouseChoice([paper], "ru")).toBe(unifiedChoice("cat-paper"));
    expect(defaultWarehouseChoice([], "ru")).toBe(StockTargetKind.Ignore);
  });

  it("old lf_material / sheet_paper targets are retired (not offered, still parse)", () => {
    expect(parseChoice(StockTargetKind.LfMaterial)).toEqual({ kind: StockTargetKind.LfMaterial, groupId: null });
    const values = warehouseChoices([roll, paper], "ru", (k) => k).map((e) => e.value);
    expect(values).toEqual([unifiedChoice("cat-rolls"), unifiedChoice("cat-paper"), StockTargetKind.Ignore]);
  });
});
