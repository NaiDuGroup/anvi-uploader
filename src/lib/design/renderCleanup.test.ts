import { describe, expect, it } from "vitest";
import { supersededDesignRenderKeys } from "./renderCleanup";

describe("supersededDesignRenderKeys", () => {
  it("returns the old designs/ render and thumb after a fresh render", () => {
    expect(
      supersededDesignRenderKeys(
        { renderKey: "designs/1-a.png", thumbKey: "designs/1-thumb-a.png" },
        { renderKey: "designs/2-a.png", thumbKey: "designs/2-thumb-a.png" },
      ),
    ).toEqual(["designs/1-a.png", "designs/1-thumb-a.png"]);
  });
  it("keeps a thumb that is not replaced and never touches uploads/ keys", () => {
    expect(
      supersededDesignRenderKeys(
        { renderKey: "uploads/1-a.png", thumbKey: "designs/1-thumb-a.png" },
        { renderKey: "designs/2-a.png" },
      ),
    ).toEqual([]);
  });
  it("is empty for a first render or an unchanged key", () => {
    expect(supersededDesignRenderKeys({ renderKey: null, thumbKey: null }, { renderKey: "designs/2-a.png" })).toEqual([]);
    expect(
      supersededDesignRenderKeys({ renderKey: "designs/1-a.png", thumbKey: null }, { renderKey: "designs/1-a.png" }),
    ).toEqual([]);
  });
});
