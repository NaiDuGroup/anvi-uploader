import { describe, expect, it } from "vitest";
import { emptyStudioDoc, type StudioDoc } from "./document";
import { resumableDrafts, type StoredStudioDoc } from "./storage";
import { studioSurfaces, surfaceBase } from "./surfaces";

const base: StudioDoc = emptyStudioDoc("mug", studioSurfaces("mug").map(surfaceBase));
const withText: StudioDoc = {
  ...base,
  surfaces: [{ ...base.surfaces[0]!, layers: [{ id: "t", kind: "text", x: 0, y: 0, w: 10, h: 5, rotation: 0, text: "Ana", fontFamily: "Montserrat", bold: true, sizePt: 20, color: "#000000", align: "center", lineHeight: 1.2 }] }],
};
const row = (id: string, o: Partial<StoredStudioDoc> = {}): StoredStudioDoc => ({ id, kind: "mug", doc: withText, at: 1, ...o });

describe("drafts offered on «Continui designul început?»", () => {
  it("skips designs put in the cart (ordered since), designs still in the cart and empty ones", () => {
    const rows = [row("a"), row("ordered", { cartedAt: 5 }), row("incart"), row("empty", { doc: base })];
    expect(resumableDrafts(rows, ["incart"]).map((d) => d.id)).toEqual(["a"]);
  });

  it("keeps old saved drafts without the field", () => {
    expect(resumableDrafts([row("old", { cartedAt: undefined }), row("nul", { cartedAt: null })], []).map((d) => d.id)).toEqual(["old", "nul"]);
  });
});
