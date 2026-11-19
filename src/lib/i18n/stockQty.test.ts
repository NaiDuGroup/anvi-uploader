import { describe, expect, it } from "vitest";
import { enStockQty, roStockQty, ruStockQty } from "./stockQty";

describe("stock quantity with unit", () => {
  it("Russian sheets take plural forms, never «л.»", () => {
    expect(ruStockQty(1, "sheet")).toBe("1 лист");
    expect(ruStockQty(2, "sheet")).toBe("2 листа");
    expect(ruStockQty(5, "sheet")).toBe("5 листов");
    expect(ruStockQty(11, "sheet")).toBe("11 листов");
    expect(ruStockQty(21, "sheet")).toBe("21 лист");
    expect(ruStockQty(-3, "sheet")).toBe("-3 листа");
    expect(ruStockQty(0, "sheet")).toBe("0 листов");
    expect(ruStockQty(2.5, "sheet")).toBe("2.5 листа");
  });
  it("other units keep the short unit", () => {
    expect(ruStockQty(12.5, "m")).toBe("12.5 м");
    expect(roStockQty(3, "pcs")).toBe("3 buc");
    expect(enStockQty(1, "g")).toBe("1 g");
  });
  it("Romanian and English sheets", () => {
    expect(roStockQty(1, "sheet")).toBe("1 coală");
    expect(roStockQty(5, "sheet")).toBe("5 coli");
    expect(roStockQty(20, "sheet")).toBe("20 de coli");
    expect(enStockQty(1, "sheet")).toBe("1 sheet");
    expect(enStockQty(4, "sheet")).toBe("4 sheets");
  });
});
