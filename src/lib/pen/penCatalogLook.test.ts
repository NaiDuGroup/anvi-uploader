import { describe, expect, it } from "vitest";
import { parsePenAttributes } from "./penVariantAttributes";
import { penCatalogLook } from "./penCatalogLook";

const look = (sku: string, attrs: unknown) => penCatalogLook(sku, attrs, parsePenAttributes(attrs));

describe("penCatalogLook (/api/pen-products colour + zone)", () => {
  it("takes the body colour from the shop option, not the card default #1f1f1f", () => {
    expect(look("BL1917S101", {}).bodyColorHex).toBe("#ffffff");
    expect(look("BL1917S155", {}).bodyColorHex).toBe("#1f2a4d");
    expect(look("BL1612S1251", { bodyColorHex: "#1f1f1f", printWidthCm: 4, printHeightCm: 1.5 }).bodyColorHex).toBe("#c0c0c0");
    expect(look("ARDENES_WHITE", { bodyColorHex: "#1f1f1f", printWidthCm: 5, printHeightCm: 0.6 }).bodyColorHex).toBe("#f4f4f4");
  });
  it("serves the Studio's zone (the same the editor and checkout use)", () => {
    expect(look("BL1917S101", {})).toMatchObject({ printWidthCm: 4, printHeightCm: 0.6 });
    expect(look("BL1333TA49", {})).toMatchObject({ printWidthCm: 4, printHeightCm: 0.6 });
    expect(look("BL1612S1251", { printWidthCm: 4, printHeightCm: 1.5 })).toMatchObject({ printWidthCm: 4, printHeightCm: 0.6 });
    expect(look("LA1573S129", { printWidthCm: 4, printHeightCm: 1.5 })).toMatchObject({ printWidthCm: 4, printHeightCm: 0.5 });
    expect(look("HW8036S129", {})).toMatchObject({ printWidthCm: 12, printHeightCm: 3 });
    expect(look("ARDENES_BLUE", { printWidthCm: 5, printHeightCm: 0.6 })).toMatchObject({ printWidthCm: 5, printHeightCm: 0.6 });
  });
  it("pens the shop does not sell keep the card values", () => {
    expect(look("OLD-PEN", { bodyColorHex: "#123456", printWidthCm: 6, printHeightCm: 1 })).toEqual({ bodyColorHex: "#123456", printWidthCm: 6, printHeightCm: 1 });
  });
});
