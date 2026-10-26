import { describe, expect, it } from "vitest";
import { ro } from "./i18n/ro";
import { ru } from "./i18n/ru";
import { buildProductPickerSections, ProductPickerGroup } from "./productTypes";
import { PRODUCT_TYPES } from "./validations";

describe("buildProductPickerSections", () => {
  it("groups every product type into print, souvenirs and textile", () => {
    const sections = buildProductPickerSections(PRODUCT_TYPES, ru, "");
    expect(sections.map((s) => s.group)).toEqual([
      ProductPickerGroup.Print,
      ProductPickerGroup.Souvenir,
      ProductPickerGroup.Textile,
    ]);
    const ids = sections.flatMap((s) => s.items.map((i) => i.config.dbProductType));
    expect([...ids].sort()).toEqual([...PRODUCT_TYPES].sort());
    expect(sections[1]!.items.map((i) => i.config.dbProductType)).toEqual([
      "mug",
      "notebook",
      "pen",
      "uv_print",
      "sublimation_print",
    ]);
  });

  it("filters by title case-insensitively and drops empty groups", () => {
    const sections = buildProductPickerSections(PRODUCT_TYPES, ru, "КРУЖ");
    expect(sections).toHaveLength(1);
    // «Кружка» by title, «Сублимация» by its hint («… и кружки — со склада»).
    expect(sections[0]!.items.map((i) => i.config.dbProductType)).toEqual(["mug", "sublimation_print"]);
  });

  it("matches the hint too, in the active language", () => {
    const sections = buildProductPickerSections(PRODUCT_TYPES, ro, "ciorapi");
    expect(sections.flatMap((s) => s.items.map((i) => i.config.dbProductType))).toEqual(["dtf_apparel"]);
  });

  it("finds UV print by its hint", () => {
    const sections = buildProductPickerSections(PRODUCT_TYPES, ru, "блокноты и другие");
    expect(sections.flatMap((s) => s.items.map((i) => i.config.dbProductType))).toEqual(["uv_print"]);
  });

  it("finds sublimation by its hint", () => {
    const sections = buildProductPickerSections(PRODUCT_TYPES, ru, "пазлы");
    expect(sections.flatMap((s) => s.items.map((i) => i.config.dbProductType))).toEqual(["sublimation_print"]);
  });

  it("returns nothing for an unknown query", () => {
    expect(buildProductPickerSections(PRODUCT_TYPES, ru, "zzz")).toEqual([]);
  });
});
