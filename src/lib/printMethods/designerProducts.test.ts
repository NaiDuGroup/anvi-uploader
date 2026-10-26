import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ru } from "@/lib/i18n/ru";
import { buildProductPickerSections } from "@/lib/productTypes";
import { PRODUCT_TYPES } from "@/lib/validations";
import {
  adminLineProductTypes,
  adminProductMenuValue,
  designerProductForCategory,
  isDesignerProductType,
  printMethodForDesignerProduct,
} from "./designerProducts";

describe("designerProductForCategory", () => {
  it("maps UV pens and notebooks, sublimation mugs", () => {
    expect(designerProductForCategory("uv_print", "pens")).toBe("pen");
    expect(designerProductForCategory("uv_print", "notebooks")).toBe("notebook");
    expect(designerProductForCategory("sublimation_print", "mugs")).toBe("mug");
  });

  it("keeps every other category in the print-method editor", () => {
    expect(designerProductForCategory("uv_print", "mugs")).toBeNull();
    expect(designerProductForCategory("uv_print", "lighters")).toBeNull();
    expect(designerProductForCategory("sublimation_print", "pens")).toBeNull();
    expect(designerProductForCategory("sublimation_print", "pillows")).toBeNull();
    expect(designerProductForCategory("uv_print", "toString")).toBeNull();
    expect(designerProductForCategory("uv_print", null)).toBeNull();
  });

  it("maps designer products back to their print method", () => {
    expect(printMethodForDesignerProduct("pen")).toBe("uv_print");
    expect(printMethodForDesignerProduct("notebook")).toBe("uv_print");
    expect(printMethodForDesignerProduct("mug")).toBe("sublimation_print");
    expect(printMethodForDesignerProduct("dtf_apparel")).toBeNull();
    expect(isDesignerProductType("pen")).toBe(true);
    expect(isDesignerProductType("uv_print")).toBe(false);
  });
});

describe("product menus", () => {
  it("admin lines offer UV / sublimation instead of pen, notebook and mug", () => {
    const admin = adminLineProductTypes(PRODUCT_TYPES);
    expect(admin).not.toContain("pen");
    expect(admin).not.toContain("notebook");
    expect(admin).not.toContain("mug");
    expect(admin).toContain("uv_print");
    expect(admin).toContain("sublimation_print");
    expect(admin).toHaveLength(PRODUCT_TYPES.length - 3);
    const menu = buildProductPickerSections(admin, ru, "").flatMap((s) => s.items.map((i) => i.config.dbProductType));
    expect([...menu].sort()).toEqual([...admin].sort());
  });

  it("shows an old pen / notebook / mug line under its print method", () => {
    expect(adminProductMenuValue("pen")).toBe("uv_print");
    expect(adminProductMenuValue("notebook")).toBe("uv_print");
    expect(adminProductMenuValue("mug")).toBe("sublimation_print");
    expect(adminProductMenuValue("paper_print")).toBe("paper_print");
    expect(adminProductMenuValue("uv_print")).toBe("uv_print");
  });

  it("leaves the full registry (cabinet, public pages) with pen, notebook and mug", () => {
    const all = buildProductPickerSections(PRODUCT_TYPES, ru, "").flatMap((s) => s.items.map((i) => i.config.dbProductType));
    expect(all).toEqual(expect.arrayContaining(["pen", "notebook", "mug"]));
  });

  it("keeps the cabinet tabs for mug, notebook and pen", () => {
    const src: string = readFileSync(
      path.resolve(__dirname, "../../app/cabinet/orders/new/CabinetNewOrderClient.tsx"),
      "utf8",
    );
    for (const id of ["mug", "notebook", "pen"]) {
      expect(src).toMatch(new RegExp(`\\{ id: "${id}", Icon: \\w+, label: "tab\\w+" \\}`));
    }
    expect(src).not.toMatch(/id: "uv_print"/);
    expect(src).not.toMatch(/id: "sublimation_print"/);
  });
});
