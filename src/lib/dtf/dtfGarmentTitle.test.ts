import { describe, expect, it } from "vitest";
import { dtfGarmentName, dtfGarmentTitle } from "./dtfGarmentTitle";
import { applyDtfGarmentNames, dtfStockItemIdsWithoutNames } from "./dtfGarmentNames";
import { toDtfPublicSummary } from "./dtfPublicSummary";

const capNames = { ro: "Șapcă ERIS bleumarin", ru: "Кепка ERIS тёмно-синяя", en: "ERIS cap navy" };
const teeNames = { ro: "Tricou DOGO PREMIUM alb", ru: "Футболка DOGO PREMIUM белая", en: "" };

describe("dtfGarmentTitle", () => {
  it("shows the name in the viewer's language without repeating the kind or colour", () => {
    expect(dtfGarmentTitle({ name: capNames.ro, names: capNames, colorName: "" }, "Кепка", "ru")).toBe(
      "Кепка ERIS тёмно-синяя",
    );
    expect(dtfGarmentTitle({ name: teeNames.ro, names: teeNames, colorName: "белый" }, "Футболка", "ru")).toBe(
      "Футболка DOGO PREMIUM белая",
    );
    expect(dtfGarmentTitle({ name: "ERIS", names: undefined, colorName: "чёрный" }, "Кепка", "ru")).toBe(
      "Кепка · ERIS · чёрный",
    );
  });

  it("keeps the stored name on old lines and never leaves an empty «·»", () => {
    expect(dtfGarmentTitle({ name: capNames.ro, colorName: "" }, "Кепка", "ru")).toBe("Кепка · Șapcă ERIS bleumarin");
    expect(dtfGarmentName({ name: teeNames.ro, names: teeNames }, "en")).toBe(teeNames.ro);
  });
});

describe("DTF garment names on old lines", () => {
  const line = (garment: Record<string, unknown> | null) => ({
    dtfLineData: { version: 1, garmentSource: "stock", garment, sizes: [], zones: [], quantity: 3, consumption: {}, pricing: {}, costs: {} },
  });

  it("fills the names of lines that only kept the Romanian name", () => {
    const old = line({ garmentProductId: "c:navy", stockItemId: "c", kind: "cap", name: capNames.ro, colorName: "", colorHex: null });
    const fresh = line({ garmentProductId: "t:w", stockItemId: "t", kind: "tshirt", name: teeNames.ro, names: teeNames, colorName: "", colorHex: null });
    const legacy = line({ garmentProductId: "g1", kind: "tshirt", name: "DOGO", colorName: "White", colorHex: null });
    const lines = [old, fresh, legacy, line(null), { dtfLineData: null }];
    expect(dtfStockItemIdsWithoutNames(lines)).toEqual(["c"]);
    applyDtfGarmentNames(lines, new Map([["c", capNames]]));
    expect(toDtfPublicSummary(old.dtfLineData)?.garment?.names).toEqual(capNames);
    expect(toDtfPublicSummary(legacy.dtfLineData)?.garment).not.toHaveProperty("names");
  });
});
