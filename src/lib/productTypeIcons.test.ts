import { describe, expect, it } from "vitest";
import { lineTypeKey, PRODUCT_TYPE_ICONS } from "./productTypeIcons";
import { PRODUCT_TYPES } from "./validations";

describe("PRODUCT_TYPE_ICONS", () => {
  it("gives every product type (and UV-DTF) its own icon", () => {
    for (const pt of PRODUCT_TYPES) expect(PRODUCT_TYPE_ICONS[pt]).toBeDefined();
    const icons = Object.values(PRODUCT_TYPE_ICONS);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("splits UV-DTF stickers off UV print", () => {
    const uv = { version: 1, source: "stickers", quantity: 1, zones: [], consumption: {}, pricing: {}, costs: {} };
    expect(lineTypeKey("uv_print", uv)).toBe("uv_dtf");
    expect(lineTypeKey("uv_print", { ...uv, source: "stock" })).toBe("uv_print");
    expect(lineTypeKey("uv_print", { ...uv, source: "stock", technique: "transfer" })).toBe("uv_dtf");
    expect(lineTypeKey("sticker_sheet")).toBe("sticker_sheet");
    expect(lineTypeKey("unknown")).toBeNull();
  });
});
