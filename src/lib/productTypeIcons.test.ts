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
    expect(lineTypeKey("postcard")).toBe("postcard");
    expect(lineTypeKey("unknown")).toBeNull();
  });

  it("shows a ready gift set line as «Набор»", () => {
    const set = { templateId: "pen_notebook_thermos", name: "Ручка + блокнот + термос", kind: "ready", role: "ready", quantity: 1 };
    expect(lineTypeKey("uv_print", { source: "stock" }, set)).toBe("gift_set");
    expect(lineTypeKey("pen", null, { ...set, kind: "assembled", role: "pen" })).toBe("pen");
  });
});
