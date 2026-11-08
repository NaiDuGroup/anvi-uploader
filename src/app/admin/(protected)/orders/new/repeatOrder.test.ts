import { describe, expect, it } from "vitest";
import { canJoinRepeatLine, repeatLineRuns, withoutMissingLayoutPhotos } from "./repeatOrder";

const paper = (key: string | null, extra: Partial<Parameters<typeof canJoinRepeatLine>[1]> = {}) => ({
  repeatLineKey: key,
  productType: "paper_print",
  designId: null,
  manualUnitPriceMdl: null,
  ...extra,
});

describe("canJoinRepeatLine", () => {
  it("joins adjacent paper rows of the same repeated line", () => {
    expect(canJoinRepeatLine(paper("L1"), paper("L1"))).toBe(true);
  });
  it("keeps rows apart when the line, product, design or manual price differ", () => {
    expect(canJoinRepeatLine(null, paper("L1"))).toBe(false);
    expect(canJoinRepeatLine(paper("L1"), paper("L2"))).toBe(false);
    expect(canJoinRepeatLine(paper(null), paper(null))).toBe(false);
    expect(canJoinRepeatLine(paper("L1"), paper("L1", { productType: "large_format_print" }))).toBe(false);
    expect(canJoinRepeatLine(paper("L1", { productType: "large_format_print" }), paper("L1", { productType: "large_format_print" }))).toBe(false);
    expect(canJoinRepeatLine(paper("L1"), paper("L1", { designId: "d1" }))).toBe(false);
    expect(canJoinRepeatLine(paper("L1", { manualUnitPriceMdl: 2 }), paper("L1", { manualUnitPriceMdl: 3 }))).toBe(false);
    expect(canJoinRepeatLine(paper("L1", { manualUnitPriceMdl: 2 }), paper("L1", { manualUnitPriceMdl: 2 }))).toBe(true);
  });
});

describe("repeatLineRuns", () => {
  it("numbers rows within runs of 2+ adjacent rows", () => {
    const runs = repeatLineRuns([
      { id: "a", repeatLineKey: "L1" },
      { id: "b", repeatLineKey: "L1" },
      { id: "c", repeatLineKey: "L2" },
      { id: "d" },
      { id: "e", repeatLineKey: "L3" },
      { id: "f", repeatLineKey: "L3" },
      { id: "g", repeatLineKey: "L3" },
    ]);
    expect(runs.get("a")).toEqual({ index: 1, count: 2 });
    expect(runs.get("b")).toEqual({ index: 2, count: 2 });
    expect(runs.has("c")).toBe(false);
    expect(runs.has("d")).toBe(false);
    expect(runs.get("g")).toEqual({ index: 3, count: 3 });
  });
});

describe("withoutMissingLayoutPhotos", () => {
  const layout = {
    templateId: "t",
    photoUrls: ["uploads/a.jpg", "uploads/b.jpg", "uploads/c.jpg"],
    photoSettings: [{ fitMode: "cover" }, { fitMode: "contain" }, { fitMode: "cover" }],
  };
  it("drops expired photos and their settings together", () => {
    const res = withoutMissingLayoutPhotos(layout, new Set(["uploads/b.jpg"]));
    expect(res.removed).toBe(1);
    expect(res.layout?.photoUrls).toEqual(["uploads/a.jpg", "uploads/c.jpg"]);
    expect(res.layout?.photoSettings).toEqual([{ fitMode: "cover" }, { fitMode: "cover" }]);
    expect(res.layout?.templateId).toBe("t");
  });
  it("returns the layout untouched when nothing is missing", () => {
    expect(withoutMissingLayoutPhotos(layout, new Set())).toEqual({ layout, removed: 0 });
    expect(withoutMissingLayoutPhotos(undefined, new Set(["x"]))).toEqual({ layout: undefined, removed: 0 });
  });
});
