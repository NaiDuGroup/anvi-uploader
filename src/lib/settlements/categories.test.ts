import { describe, expect, it } from "vitest";
import { resolveCategory } from "./categories";

const base = { idno: "1004600069507", manual: null, operational: false };

describe("resolveCategory", () => {
  it("one-sided parties: purchases → supplier, sales → customer", () => {
    expect(resolveCategory({ ...base, hasPurchaseInvoices: true, hasSalesInvoices: false })).toMatchObject({
      category: "supplier",
      source: "auto",
      autoCategory: "supplier",
    });
    expect(resolveCategory({ ...base, hasPurchaseInvoices: false, hasSalesInvoices: true }).category).toBe("customer");
  });

  it("mixed party: the larger invoiced turnover wins (CRAFTI BUSINESS)", () => {
    const r = resolveCategory({
      ...base,
      hasPurchaseInvoices: true,
      hasSalesInvoices: true,
      salesInvoiced: 976_401.92,
      purchasesInvoiced: 15_798.29,
    });
    expect(r).toMatchObject({ category: "customer", source: "auto", service: false });
    expect(
      resolveCategory({ ...base, hasPurchaseInvoices: true, hasSalesInvoices: true, salesInvoiced: 100, purchasesInvoiced: 900 })
        .category,
    ).toBe("supplier");
  });

  it("mixed party without amounts / tie stays supplier", () => {
    expect(resolveCategory({ ...base, hasPurchaseInvoices: true, hasSalesInvoices: true }).category).toBe("supplier");
    expect(
      resolveCategory({ ...base, hasPurchaseInvoices: true, hasSalesInvoices: true, salesInvoiced: 5, purchasesInvoiced: 5 })
        .category,
    ).toBe("supplier");
  });

  it("manual wins but the auto category is still reported", () => {
    const r = resolveCategory({
      ...base,
      manual: "other",
      hasPurchaseInvoices: true,
      hasSalesInvoices: false,
    });
    expect(r).toMatchObject({ category: "other", source: "manual", autoCategory: "supplier", autoSource: "auto" });
  });

  it("built-in default / operational / none", () => {
    expect(
      resolveCategory({ ...base, idno: "1002600003778", manual: "supplier", hasPurchaseInvoices: true, hasSalesInvoices: false }),
    ).toMatchObject({ category: "supplier", source: "manual", autoCategory: "bank", autoSource: "default" });
    expect(
      resolveCategory({ ...base, operational: true, hasPurchaseInvoices: true, hasSalesInvoices: true }),
    ).toMatchObject({ category: "other", source: "operational", service: true });
    expect(resolveCategory({ ...base, hasPurchaseInvoices: false, hasSalesInvoices: false })).toMatchObject({
      category: null,
      autoCategory: null,
    });
  });
});
