import { Prisma, type PrintPricePreset } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { printPresetCreateData, printPresetUpdateData, toPrintPresetJson, toPrintPresetOption } from "./presetRows";
import { printPresetPatchSchema, printPresetSchema } from "./presets";

const valid = { label: " A4 21×30 ", widthCm: 21, heightCm: 30, retailPrice: 180 };

describe("printPresetSchema", () => {
  it("accepts a minimal preset and trims the label", () => {
    expect(printPresetSchema.parse(valid)).toEqual({ ...valid, label: "A4 21×30" });
  });

  it.each([
    ["empty label", { ...valid, label: "  " }],
    ["zero width", { ...valid, widthCm: 0 }],
    ["too tall", { ...valid, heightCm: 201 }],
    ["negative price", { ...valid, retailPrice: -1 }],
    ["string price", { ...valid, retailPrice: "180" }],
    ["fractional sort order", { ...valid, sortOrder: 1.5 }],
  ])("rejects %s", (_name, body) => {
    expect(printPresetSchema.safeParse(body).success).toBe(false);
  });

  it("patch accepts any subset and a null dealer price", () => {
    expect(printPresetPatchSchema.parse({})).toEqual({});
    expect(printPresetPatchSchema.parse({ dealerPrice: null })).toEqual({ dealerPrice: null });
    expect(printPresetPatchSchema.safeParse({ widthCm: -2 }).success).toBe(false);
  });
});

describe("preset rows", () => {
  it("create data rounds money to 2 decimals and defaults active/sort", () => {
    const data = printPresetCreateData("uv", { ...valid, label: "A4", retailPrice: 10.005, dealerPrice: 8.333 });
    expect(data.methodCode).toBe("uv");
    expect(String(data.retailPrice)).toBe("10.01");
    expect(String(data.dealerPrice)).toBe("8.33");
    expect(data.isActive).toBe(true);
    expect(data.sortOrder).toBe(0);
    expect(printPresetCreateData("uv", { ...valid, dealerPrice: null }).dealerPrice).toBeNull();
  });

  it("update data leaves absent keys alone and clears dealer price on null", () => {
    expect(printPresetUpdateData({ label: "x" })).toMatchObject({ label: "x", retailPrice: undefined, dealerPrice: undefined });
    expect(printPresetUpdateData({ dealerPrice: null }).dealerPrice).toBeNull();
    expect(String(printPresetUpdateData({ dealerPrice: 5 }).dealerPrice)).toBe("5");
  });

  it("row → plain numbers", () => {
    const row: PrintPricePreset = {
      id: "p1",
      methodCode: "dtf",
      label: "Logo",
      widthCm: new Prisma.Decimal("10.00"),
      heightCm: new Prisma.Decimal("10.00"),
      retailPrice: new Prisma.Decimal("50.00"),
      dealerPrice: null,
      isActive: true,
      sortOrder: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    expect(toPrintPresetOption(row)).toEqual({
      id: "p1",
      label: "Logo",
      widthCm: 10,
      heightCm: 10,
      retailPrice: 50,
      dealerPrice: null,
    });
    expect(toPrintPresetJson({ ...row, dealerPrice: new Prisma.Decimal("40.5") })).toMatchObject({
      dealerPrice: 40.5,
      isActive: true,
      sortOrder: 0,
    });
  });
});
