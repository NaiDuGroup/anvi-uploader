import { describe, expect, it } from "vitest";
import { isMagicMug, mugLookKey, studioMugLook } from "./mugLook";

describe("studioMugLook", () => {
  it("defaults to a white glossy standard mug without an item", () => {
    const l = studioMugLook(null);
    expect(l).toMatchObject({
      bodyHex: "#f5f5f0",
      finish: "glossy",
      magic: false,
      print: null,
    });
    expect(l.shape.bodyHeightCm).toBe(9.6);
    expect(studioMugLook(null, { variantHex: "#123456" }).bodyHex).toBe("#123456");
  });

  it("reads the coloured inside, rim, handle, finish, band and shape from the item", () => {
    const l = studioMugLook({
      bodyColorHex: "#FFFFFF",
      handleColorHex: "#e5484d",
      innerColorHex: "#e5484d",
      rimColorHex: null,
      finish: "matte",
      gradientColorHex: "#2f6fed",
      gradientHeightPct: 40,
      bodyHeightCm: 12,
      topDiameterCm: 8.7,
      bottomDiameterCm: 8.7,
      handleStyle: "heart",
      printWidthCm: 20,
      printHeightCm: 9,
    });
    expect(l).toMatchObject({
      bodyHex: "#ffffff",
      handleHex: "#e5484d",
      innerHex: "#e5484d",
      rimHex: "#ffffff",
      finish: "matte",
      gradientHex: "#2f6fed",
      gradientPct: 40,
    });
    expect(l.shape).toMatchObject({ bodyHeightCm: 12, handleStyle: "heart" });
    expect(l.print).toEqual({ widthCm: 20, heightCm: 9 });
  });

  it("shows a magic mug in its design (hot) state, the coating colour when cold", () => {
    const item = {
      nameRo: "Cană magică neagră",
      bodyColorHex: "#1c1c1c",
      handleColorHex: "#1c1c1c",
      innerColorHex: "#1c1c1c",
    };
    expect(isMagicMug(item)).toBe(true);
    expect(isMagicMug({ nameRu: "Кружка хамелеон" })).toBe(true);
    expect(isMagicMug({ nameEn: "Classic white mug" })).toBe(false);
    const hot = studioMugLook(item);
    expect(hot).toMatchObject({
      magic: true,
      bodyHex: "#ffffff",
      innerHex: "#1c1c1c",
      handleHex: "#1c1c1c",
      coldBodyHex: "#1c1c1c",
    });
    expect(studioMugLook(item, { state: "cold" }).bodyHex).toBe("#1c1c1c");
    expect(mugLookKey(hot)).not.toBe(mugLookKey(studioMugLook(item, { state: "cold" })));
  });
});
