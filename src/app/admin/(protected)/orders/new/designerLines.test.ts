import { describe, expect, it } from "vitest";
import { CATALOG as UV_FIXTURE, PEN, uuid } from "@/lib/uv/uvTestFixtures";
import { CATALOG as SUBL_FIXTURE, PILLOW } from "@/lib/sublimation/sublimationTestFixtures";
import type { UvCatalogJson, UvStockItemJson } from "@/lib/uv/dto";
import type { SublimationCatalogJson, SublimationStockItemJson } from "@/lib/sublimation/dto";
import { uvDraftFromLineData, withUvItem } from "@/lib/uv/uvDraft";
import type { PenLayoutData } from "@/lib/validations";
import {
  convertPickedDesignerItem,
  designerCreateLine,
  designerRowVariantId,
  designerUpdateLineFields,
  emptyWizardSublimationDraft,
  emptyWizardUvDraft,
  pickPrintMethodItem,
  toPrintMethodLine,
  type DesignerConvertibleAssign,
  type DesignerLineCatalogs,
} from "./designerLines";
import { minimalUploadReadyMugLayout, minimalUploadReadyPenLayout } from "./adminWizardLayoutPrepare";

const NOTEBOOK: UvStockItemJson = {
  ...PEN,
  id: uuid(40),
  itemId: uuid(41),
  categoryCode: "notebooks",
  categoryNames: { ro: "Agende", ru: "Блокноты", en: "Notebooks" },
  itemNames: { ro: "Agendă A5", ru: "Блокнот A5", en: "Notebook A5" },
  name: "Agendă A5",
  sku: "NB-A5",
};

const LIGHTER: UvStockItemJson = {
  ...PEN,
  id: uuid(50),
  itemId: uuid(51),
  categoryCode: "lighters",
  categoryNames: { ro: "Brichete", ru: "Зажигалки", en: "Lighters" },
  itemNames: { ro: "Brichetă", ru: "Зажигалка", en: "Lighter" },
  name: "Brichetă",
  sku: "LIGHTER",
};

const MUG: SublimationStockItemJson = {
  ...PILLOW,
  id: uuid(60),
  itemId: uuid(61),
  categoryCode: "mugs",
  categoryNames: { ro: "Căni", ru: "Кружки", en: "Mugs" },
  itemNames: { ro: "Cană albă", ru: "Кружка белая", en: "White mug" },
  name: "Cană albă",
  sku: "MUG-WHITE",
};

/** Pens first, as in the real catalog order — the wizard must not land on them by default. */
const UV: UvCatalogJson = { ...UV_FIXTURE, items: [PEN, NOTEBOOK, LIGHTER] };
const SUBL: SublimationCatalogJson = { ...SUBL_FIXTURE, items: [MUG, ...SUBL_FIXTURE.items] };
const CATALOGS: DesignerLineCatalogs = { uv: UV, sublimation: SUBL };

const FILE = { fileName: "layout.png", fileUrl: "uploads/layout.png" };

/** Wizard row as `defaultAssign` creates it (the fields this module reads). */
function blankRow(): DesignerConvertibleAssign {
  return {
    productType: "paper_print",
    copiesStr: "1",
    linePriceStr: "",
    mugPick: { type: "catalog", productId: MUG.id },
    nbPick: { type: "catalog", productId: NOTEBOOK.id },
    penPick: { type: "catalog", productId: PEN.id },
    uv: null,
    sublimation: null,
    designId: null,
  };
}

/** Old flow: product menu «Ручка» / «Блокнот» / «Кружка», SKU from the catalog modal, copies typed. */
function viaOldProduct(
  product: "pen" | "notebook" | "mug",
  variantId: string,
  copies: number,
): DesignerConvertibleAssign {
  const pickField = product === "pen" ? "penPick" : product === "notebook" ? "nbPick" : "mugPick";
  return {
    ...blankRow(),
    productType: product,
    linePriceStr: "",
    [pickField]: { type: "catalog", productId: variantId },
    copiesStr: String(copies),
  };
}

/** New flow: menu «UV-печать», quantity typed, item picked in the UV editor. */
function viaUv(variantId: string, quantity: number): DesignerConvertibleAssign {
  const uvRow: DesignerConvertibleAssign = {
    ...blankRow(),
    productType: "uv_print",
    uv: { ...emptyWizardUvDraft(UV), quantityStr: String(quantity) },
    copiesStr: String(quantity),
  };
  const picked: DesignerConvertibleAssign = { ...uvRow, uv: withUvItem(uvRow.uv!, UV, "stock", variantId) };
  return convertPickedDesignerItem(uvRow, picked, CATALOGS);
}

function viaSublimation(variantId: string, quantity: number): DesignerConvertibleAssign {
  const row: DesignerConvertibleAssign = {
    ...blankRow(),
    productType: "sublimation_print",
    sublimation: { ...emptyWizardSublimationDraft(SUBL), quantityStr: String(quantity) },
    copiesStr: String(quantity),
  };
  return convertPickedDesignerItem(row, { ...row, sublimation: { ...row.sublimation!, variantId } }, CATALOGS);
}

describe("new UV / sublimation drafts", () => {
  it("start on an item without a designer", () => {
    expect(emptyWizardUvDraft(UV)).toMatchObject({ source: "stock", variantId: LIGHTER.id });
    expect(emptyWizardSublimationDraft(SUBL).variantId).toBe(PILLOW.id);
  });

  it("fall back to the client's item (UV) or the only blank (sublimation)", () => {
    expect(emptyWizardUvDraft({ ...UV, items: [PEN, NOTEBOOK] })).toMatchObject({ source: "client", variantId: null });
    expect(emptyWizardSublimationDraft({ ...SUBL, items: [MUG] }).variantId).toBe(MUG.id);
  });
});

describe("request body via the print method equals the old product", () => {
  it.each([
    ["pen", PEN.id],
    ["notebook", NOTEBOOK.id],
  ] as const)("UV → %s", (product, variantId) => {
    const row = viaUv(variantId, 50);
    expect(row.productType).toBe(product);
    const old = viaOldProduct(product, variantId, 50);
    expect(designerCreateLine(row, FILE, 50)).toEqual(designerCreateLine(old, FILE, 50));
    expect(JSON.stringify(designerCreateLine(row, FILE, 50))).toBe(JSON.stringify(designerCreateLine(old, FILE, 50)));
    expect(designerUpdateLineFields(row)).toEqual(designerUpdateLineFields(old));
    expect(row.copiesStr).toBe(old.copiesStr);
    expect(row.linePriceStr).toBe(old.linePriceStr);
  });

  it("sublimation → mug", () => {
    const row = viaSublimation(MUG.id, 12);
    expect(row.productType).toBe("mug");
    const old = viaOldProduct("mug", MUG.id, 12);
    expect(JSON.stringify(designerCreateLine(row, FILE, 12))).toBe(JSON.stringify(designerCreateLine(old, FILE, 12)));
    expect(designerUpdateLineFields(row)).toEqual(designerUpdateLineFields(old));
  });

  it("pen body is today's pen line", () => {
    expect(designerCreateLine(viaUv(PEN.id, 3), FILE, 3)).toEqual({
      productType: "pen",
      penLayoutData: minimalUploadReadyPenLayout(),
      penOther: false,
      penProductId: PEN.id,
      designId: undefined,
      files: [{ ...FILE, copies: 3, color: "color" }],
    });
  });
});

describe("conversion both ways without stale data", () => {
  const penLayout: PenLayoutData = { ...minimalUploadReadyPenLayout(), text: "ANVI" };

  it("UV → pen drops the UV draft and keeps the quantity", () => {
    const row = viaUv(PEN.id, 7);
    expect(row).toMatchObject({ productType: "pen", copiesStr: "7", uv: null, sublimation: null });
    expect(row.penPick).toEqual({ type: "catalog", productId: PEN.id });
    expect(designerRowVariantId(row)).toBe(PEN.id);
  });

  it("pen → other UV item drops layout and snapshot, starts a fresh UV draft", () => {
    const pen: DesignerConvertibleAssign = {
      ...viaOldProduct("pen", PEN.id, 25),
      penLayoutData: penLayout,
      penProductSnapshot: { sku: PEN.sku },
      linePriceStr: "12",
    };
    const uv = pickPrintMethodItem(pen, "uv_print", { source: "stock", variantId: LIGHTER.id }, CATALOGS);
    expect(uv.productType).toBe("uv_print");
    expect(uv.penLayoutData).toBeUndefined();
    expect(uv.penProductSnapshot).toBeNull();
    expect(uv.linePriceStr).toBe("");
    expect(uv.copiesStr).toBe("25");
    expect(uv.uv).toMatchObject({ source: "stock", variantId: LIGHTER.id, quantityStr: "25" });
    expect(uv.uv!.zones).toHaveLength(1);
    expect(designerUpdateLineFields(uv)).toEqual({
      mugLayoutData: undefined,
      mugProductId: undefined,
      mugOther: false,
      notebookLayoutData: undefined,
      notebookProductId: undefined,
      notebookOther: false,
      penLayoutData: undefined,
      penProductId: undefined,
      penOther: false,
    });
  });

  it("pen → client item in UV", () => {
    const uv = pickPrintMethodItem(viaOldProduct("pen", PEN.id, 4), "uv_print", { source: "client" }, CATALOGS);
    expect(uv.productType).toBe("uv_print");
    expect(uv.uv).toMatchObject({ source: "client", quantityStr: "4" });
  });

  it("UV with zones → pen → UV starts over (no old zones)", () => {
    const start = toPrintMethodLine(blankRow(), "uv_print", { source: "stock", variantId: LIGHTER.id }, CATALOGS);
    const zoned: DesignerConvertibleAssign = {
      ...start,
      uv: { ...start.uv!, zones: [...start.uv!.zones, { ...start.uv!.zones[0]!, id: "z2", varnish: true }] },
    };
    const pen = convertPickedDesignerItem(zoned, { ...zoned, uv: withUvItem(zoned.uv!, UV, "stock", PEN.id) }, CATALOGS);
    expect(pen.productType).toBe("pen");
    const back = pickPrintMethodItem(pen, "uv_print", { source: "stock", variantId: LIGHTER.id }, CATALOGS);
    expect(back.uv!.zones).toHaveLength(1);
    expect(back.uv!.zones[0]!.varnish).toBe(false);
  });

  it("pen → notebook switches designer and drops the pen layout", () => {
    const pen: DesignerConvertibleAssign = { ...viaOldProduct("pen", PEN.id, 10), penLayoutData: penLayout };
    const nb = pickPrintMethodItem(pen, "uv_print", { source: "stock", variantId: NOTEBOOK.id }, CATALOGS);
    expect(nb.productType).toBe("notebook");
    expect(nb.nbPick).toEqual({ type: "catalog", productId: NOTEBOOK.id });
    expect(nb.penLayoutData).toBeUndefined();
    expect(nb.copiesStr).toBe("10");
    expect(designerCreateLine(nb, FILE, 10)).toEqual(designerCreateLine(viaOldProduct("notebook", NOTEBOOK.id, 10), FILE, 10));
  });

  it("another pen keeps the pen line and its layout (like the SKU modal)", () => {
    const other: UvStockItemJson = { ...PEN, id: uuid(70), sku: "PEN-RED" };
    const catalogs: DesignerLineCatalogs = { ...CATALOGS, uv: { ...UV, items: [...UV.items, other] } };
    const pen: DesignerConvertibleAssign = { ...viaOldProduct("pen", PEN.id, 10), penLayoutData: penLayout };
    const next = pickPrintMethodItem(pen, "uv_print", { source: "stock", variantId: other.id }, catalogs);
    expect(next.productType).toBe("pen");
    expect(next.penPick).toEqual({ type: "catalog", productId: other.id });
    expect(next.penLayoutData).toEqual(penLayout);
  });

  it("sublimation ↔ mug", () => {
    const mug = viaSublimation(MUG.id, 3);
    expect(mug).toMatchObject({ productType: "mug", copiesStr: "3", sublimation: null, uv: null });
    const back = pickPrintMethodItem(
      { ...mug, mugLayoutData: minimalUploadReadyMugLayout() },
      "sublimation_print",
      { source: "stock", variantId: PILLOW.id },
      CATALOGS,
    );
    expect(back.productType).toBe("sublimation_print");
    expect(back.mugLayoutData).toBeUndefined();
    expect(back.sublimation).toMatchObject({ source: "stock", variantId: PILLOW.id, quantityStr: "3" });
    expect(back.copiesStr).toBe("3");
  });

  it("other UV / sublimation items stay in their editor", () => {
    const row = toPrintMethodLine(blankRow(), "uv_print", { source: "stock", variantId: LIGHTER.id }, CATALOGS);
    expect(convertPickedDesignerItem(blankRow(), row, CATALOGS)).toBe(row);
    const subl = toPrintMethodLine(blankRow(), "sublimation_print", { source: "stock", variantId: PILLOW.id }, CATALOGS);
    expect(convertPickedDesignerItem(blankRow(), subl, CATALOGS)).toBe(subl);
  });
});

describe("editing saved lines", () => {
  it("an old pen line keeps its data on unrelated edits and saves as today", () => {
    const saved: DesignerConvertibleAssign = {
      ...viaOldProduct("pen", PEN.id, 100),
      penLayoutData: { ...minimalUploadReadyPenLayout(), text: "Logo" },
      penProductSnapshot: { sku: PEN.sku },
    };
    const edited = convertPickedDesignerItem(saved, { ...saved, copiesStr: "120" }, CATALOGS);
    expect(edited.copiesStr).toBe("120");
    expect(edited.penLayoutData).toEqual(saved.penLayoutData);
    expect(edited.penProductSnapshot).toEqual(saved.penProductSnapshot);
    expect(designerUpdateLineFields(edited)).toMatchObject({
      penLayoutData: saved.penLayoutData,
      penProductId: PEN.id,
      penOther: false,
    });
  });

  it("an old «other» pen and an old mug line save as today", () => {
    const other: DesignerConvertibleAssign = { ...viaOldProduct("pen", PEN.id, 1), penPick: { type: "other" } };
    expect(designerRowVariantId(other)).toBeNull();
    expect(designerUpdateLineFields(other)).toMatchObject({ penProductId: undefined, penOther: true });
    const mug = viaOldProduct("mug", MUG.id, 2);
    expect(designerUpdateLineFields(mug)).toMatchObject({ mugProductId: MUG.id, mugOther: false });
  });

  it("a saved stage-C UV line on a pen stays UV until its item is changed", () => {
    const uvDraft = uvDraftFromLineData({
      source: "stock",
      item: { variantId: PEN.id },
      quantity: 5,
      zones: [],
    } as unknown as Parameters<typeof uvDraftFromLineData>[0]);
    const saved: DesignerConvertibleAssign = { ...blankRow(), productType: "uv_print", uv: uvDraft, copiesStr: "5" };
    const qtyEdit = convertPickedDesignerItem(saved, { ...saved, uv: { ...uvDraft, quantityStr: "6" } }, CATALOGS);
    expect(qtyEdit.productType).toBe("uv_print");
    const notebook = convertPickedDesignerItem(
      saved,
      { ...saved, uv: withUvItem(uvDraft, UV, "stock", NOTEBOOK.id) },
      CATALOGS,
    );
    expect(notebook.productType).toBe("notebook");
  });
});
