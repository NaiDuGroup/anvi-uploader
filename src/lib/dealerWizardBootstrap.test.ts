import { describe, expect, it } from "vitest";
import { toDealerWizardBootstrap } from "./dealerWizardBootstrap";
import type { WizardBootstrapData } from "./wizardBootstrap";
import { STICKER_SHEET_DEFAULTS } from "./stickerSheet/stickerSheet";
import { POSTCARD_DEFAULTS } from "./postcard/postcard";
import { CATALOG as DTF_CATALOG, withQuantities } from "./dtf/dtfTestFixtures";
import { CATALOG as UV_CATALOG } from "./uv/uvTestFixtures";
import { CATALOG as SUBL_CATALOG } from "./sublimation/sublimationTestFixtures";
import { emptyDtfDraft, quoteDtfDraft } from "./dtf/dtfDraft";
import { emptyUvDraft, quoteUvDraft } from "./uv/uvDraft";
import { emptySublimationDraft, quoteSublimationDraft } from "./sublimation/sublimationDraft";

function bundle(): WizardBootstrapData {
  return {
    stickerSheetSettings: STICKER_SHEET_DEFAULTS,
    postcardSettings: POSTCARD_DEFAULTS,
    mugProducts: [
      {
        id: "m1",
        sku: "MUG",
        nameRo: "Cana",
        nameRu: "Кружка",
        nameEn: "Mug",
        imagePublicUrl: null,
        bodyColorHex: "#fff",
        handleColorHex: "#fff",
        innerColorHex: null,
        rimColorHex: null,
        printWidthCm: 20,
        printHeightCm: 9,
        printDpi: 300,
        has3dPreview: false,
        sellPrice: 100,
        dealerPrice: 80,
        purchaseCost: 30,
        avgPurchaseCost: 31,
        internalNotes: "supplier X",
      } as WizardBootstrapData["mugProducts"][number],
    ],
    notebookProducts: [],
    penProducts: [],
    lfMaterials: [],
    sheetPapers: [
      {
        id: "p1",
        name: "Paper",
        gsm: 300,
        sheetWidthCm: 32,
        sheetHeightCm: 45,
        stockVariantId: null,
        stockSku: null,
        stockSheets: 500,
        avgPurchaseCostPerSheet: 2,
        effectiveCostPerSheet: 2,
        costPerSheet: 2,
        retailPricePerSheet: 10,
        dealerPricePerSheet: 8,
        standardCardsPerSheet: 24,
        isActive: true,
        sortOrder: 0,
      },
    ],
    dtfCatalog: DTF_CATALOG,
    uvCatalog: UV_CATALOG,
    sublimationCatalog: SUBL_CATALOG,
    printEconomics: {
      inkMlPerSqmLargeFormatRoll: 10,
      minimumOrderPriceMdl: null,
      avgInkCostPerMlMdl: 0.5,
      inkStockMl: 1000,
      lfInkRetailMarkupMultiplier: 4,
      lfInkDealerMarkupMultiplier: 3,
      lfMinimumLineTotalMdl: 50,
      bcMinimumLineTotalMdl: 30,
      purchaseCostsIncludeVat: true,
    },
  };
}

describe("dealer wizard bundle", () => {
  it("drops purchase costs, notes and stock levels", () => {
    const d = toDealerWizardBootstrap(bundle());
    const json = JSON.stringify(d.mugProducts);
    expect(json).not.toContain("purchaseCost");
    expect(json).not.toContain("internalNotes");
    expect(d.mugProducts[0]).toMatchObject({ sellPrice: 100, dealerPrice: 80 });
    expect(d.sheetPapers[0]).toMatchObject({ costPerSheet: 0, effectiveCostPerSheet: 0, stockSheets: 0, dealerPricePerSheet: 8 });
    expect(d.dtfCatalog.unitCosts).toEqual({ filmPerLinearMeterMdl: 0, inkPerMlMdl: 0, powderPerGramMdl: 0 });
    expect(d.dtfCatalog.garments.flatMap((g) => g.variants).every((v) => v.unitCostMdl === null)).toBe(true);
    expect(d.uvCatalog.items.every((i) => i.unitCostMdl === null)).toBe(true);
    expect(Object.values(d.uvCatalog.inkCosts).every((v) => v === 0)).toBe(true);
    expect(d.sublimationCatalog.items.every((i) => i.unitCostMdl === null)).toBe(true);
    expect(Object.values(d.sublimationCatalog.consumableCosts).every((v) => v === 0)).toBe(true);
    expect(d.printEconomics.inkStockMl).toBe(0);
  });

  it("bakes the dealer ink markup into the ink rate", () => {
    const pe = toDealerWizardBootstrap(bundle()).printEconomics;
    expect(pe.avgInkCostPerMlMdl).toBeCloseTo(1.5);
    expect(pe.lfInkDealerMarkupMultiplier).toBe(1);
  });

  it("keeps the dealer quotes of DTF, UV and sublimation lines", () => {
    const src = bundle();
    const d = toDealerWizardBootstrap(src);

    const dtfDraft = withQuantities(emptyDtfDraft(src.dtfCatalog), { M: 3 });
    const dtfA = quoteDtfDraft(dtfDraft, "dealer", src.dtfCatalog);
    const dtfB = quoteDtfDraft(dtfDraft, "dealer", d.dtfCatalog);
    expect(dtfA.ok && dtfB.ok).toBe(true);
    if (dtfA.ok && dtfB.ok) expect(dtfB.data.pricing).toEqual(dtfA.data.pricing);

    const uvDraft = { ...emptyUvDraft(src.uvCatalog), quantityStr: "7" };
    const uvA = quoteUvDraft(uvDraft, "dealer", src.uvCatalog);
    const uvB = quoteUvDraft(uvDraft, "dealer", d.uvCatalog);
    expect(uvA.ok && uvB.ok).toBe(true);
    if (uvA.ok && uvB.ok) expect(uvB.data.pricing).toEqual(uvA.data.pricing);

    const sDraft = { ...emptySublimationDraft(src.sublimationCatalog), quantityStr: "4" };
    const sA = quoteSublimationDraft(sDraft, "dealer", src.sublimationCatalog);
    const sB = quoteSublimationDraft(sDraft, "dealer", d.sublimationCatalog);
    expect(sA.ok && sB.ok).toBe(true);
    if (sA.ok && sB.ok) expect(sB.data.pricing).toEqual(sA.data.pricing);
  });
});
