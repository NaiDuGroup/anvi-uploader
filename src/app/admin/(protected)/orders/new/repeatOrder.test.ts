import { describe, expect, it } from "vitest";
import { withoutMissingLayoutPhotos } from "./repeatOrder";

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
