import { describe, expect, it } from "vitest";
import {
  categoryCodeForGorCode,
  inflectRuAdjective,
  proposeImportItems,
  proposePrintMethods,
  type ProposalCategory,
} from "./gorFactoryProposals";

const CATS: ProposalCategory[] = [
  { id: "c-mugs", code: "mugs", printMethods: ["sublimation"] },
  { id: "c-tshirts", code: "tshirts", printMethods: ["dtf"] },
  { id: "c-misc", code: "misc_goods", printMethods: ["uv"] },
  { id: "c-apparel", code: "apparel", printMethods: ["dtf"] },
];

describe("gorFactoryProposals", () => {
  it("inflects colour adjectives", () => {
    expect(inflectRuAdjective("чёрный", "f")).toBe("чёрная");
    expect(inflectRuAdjective("синий", "f")).toBe("синяя");
    expect(inflectRuAdjective("золотой", "f")).toBe("золотая");
    expect(inflectRuAdjective("серый", "p")).toBe("серые");
    expect(inflectRuAdjective("белый", "n")).toBe("белое");
    expect(inflectRuAdjective("тёмно-синий", "f")).toBe("тёмно-синяя");
  });

  it("maps article prefixes to categories", () => {
    expect(categoryCodeForGorCode("TZ1615S102")).toBe("mugs");
    expect(categoryCodeForGorCode("BI4213S160")).toBe("bottles");
    expect(categoryCodeForGorCode("CA65020101")).toBe("tshirts");
    expect(categoryCodeForGorCode("SU10330202")).toBe("apparel");
    expect(categoryCodeForGorCode("TO0106S160")).toBe("misc_goods");
  });

  it("a mug the supplier can't sublimate becomes UV; unknown models keep the category", () => {
    expect(proposePrintMethods(["sublimation"], "")).toEqual({ methods: ["uv"], note: "no_sublimation" });
    expect(proposePrintMethods(["sublimation"], "s")).toEqual({ methods: [], note: null });
    expect(proposePrintMethods(["sublimation"], null)).toEqual({ methods: [], note: null });
    expect(proposePrintMethods(["uv"], "")).toEqual({ methods: [], note: null });
  });

  it("names Stamina items per colour and flags RADEK as UV", () => {
    const p = proposeImportItems(
      [
        { id: "1", supplierCode: "TZ1615S102", description: "MUG NEVEX BLACK" },
        { id: "2", supplierCode: "TZ1267S103", description: "MUG RADEK YELLOW" },
        { id: "3", supplierCode: "MD4001S10102", description: "MANGO SUBLIMATION MUG WHITE/BLACK" },
        { id: "4", supplierCode: "TO0106S160", description: "PICK MEASURING TAPE RED" },
      ],
      CATS,
    );
    expect(p.map((x) => [x.sku, x.categoryId, x.nameRu, x.printMethods])).toEqual([
      ["TZ1615S102", "c-mugs", "Кружка NEVEX чёрная", []],
      ["TZ1267S103", "c-mugs", "Кружка RADEK жёлтая", ["uv"]],
      ["MD4001S10102", "c-mugs", "Кружка MANGO белая/чёрная", []],
      ["TO0106S160", "c-misc", "Рулетка PICK красная", []],
    ]);
    expect(p[0]!.nameRo).toBe("Cană NEVEX neagră");
  });

  it("groups ROLY sizes of one colour into one item; a missing category stays null", () => {
    const p = proposeImportItems(
      [
        { id: "1", supplierCode: "CA65020101", description: "DOGO PREMIUM T-SHIRT S/S WHITE" },
        { id: "2", supplierCode: "CA65020201", description: "DOGO PREMIUM T-SHIRT S/M WHITE" },
        { id: "3", supplierCode: "CA65020102", description: "DOGO PREMIUM T-SHIRT S/S BLACK" },
        { id: "4", supplierCode: "BI4213S160", description: "BOTTLE KISKO RED" },
      ],
      CATS,
    );
    expect(p).toHaveLength(3);
    expect(p[0]).toMatchObject({ sku: "CA6502-01", nameRu: "Футболка DOGO PREMIUM белая", categoryId: "c-tshirts" });
    expect(p[0]!.variants.map((v) => [v.sku, v.label, v.options])).toEqual([
      ["CA65020101", "белый / S", { color: "белый", size: "S" }],
      ["CA65020201", "белый / M", { color: "белый", size: "M" }],
    ]);
    expect(p[2]).toMatchObject({ categoryCode: "bottles", categoryId: null });
  });
});
