import { describe, expect, it } from "vitest";
import { PEN_BARREL_DEFAULT_CM, studioPenZoneCm } from "./penZone";

describe("studioPenZoneCm (one pen zone rule)", () => {
  it("keeps a card zone that fits a barrel (ARDENES 5×0.6)", () => {
    expect(studioPenZoneCm("pen", { widthCm: 5, heightCm: 0.6 }, null)).toEqual({ widthCm: 5, heightCm: 0.6 });
  });
  it("a card zone taller than a barrel (the 4×1.5 card default) falls back to the product's barrel zone", () => {
    expect(studioPenZoneCm("pen", { widthCm: 4, heightCm: 1.5 }, { widthCm: 4, heightCm: 0.6 })).toEqual({ widthCm: 4, heightCm: 0.6 });
    expect(studioPenZoneCm("pencil", { widthCm: 4, heightCm: 1.5 }, { widthCm: 4, heightCm: 0.5 })).toEqual({ widthCm: 4, heightCm: 0.5 });
  });
  it("unknown sizes → the conservative barrel default", () => {
    expect(studioPenZoneCm("pen", null, null)).toEqual(PEN_BARREL_DEFAULT_CM);
    expect(studioPenZoneCm("pen", { widthCm: 4, heightCm: 1.5 }, null)).toEqual(PEN_BARREL_DEFAULT_CM);
    expect(studioPenZoneCm(undefined, { widthCm: 0, heightCm: 1 }, undefined)).toEqual(PEN_BARREL_DEFAULT_CM);
  });
  it("a case print (KIOTO) keeps the card, else the fallback zone", () => {
    expect(studioPenZoneCm("case", null, { widthCm: 12, heightCm: 3 })).toEqual({ widthCm: 12, heightCm: 3 });
    expect(studioPenZoneCm("case", { widthCm: 13, heightCm: 2.5 }, { widthCm: 12, heightCm: 3 })).toEqual({ widthCm: 13, heightCm: 2.5 });
  });
});
