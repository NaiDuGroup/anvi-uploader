import { describe, expect, it } from "vitest";
import { hasColorChoice, studioColorChoices } from "./variantColors";

const v = (id: string, hex: string, stock: number | null = 10) => ({ id, label: id, hex, stock });

describe("studioColorChoices", () => {
  it("lists every colour (7 incl. black), in catalog order, out-of-stock ones disabled", () => {
    const variants = [v("white", "#ffffff"), v("red", "#c0392b"), v("blue", "#1f3a8a"), v("green", "#14532d"), v("yellow", "#fde047"), v("pink", "#f2bfcf", 0), v("black", "#111111", null)];
    const c = studioColorChoices(variants);
    expect(c).toHaveLength(7);
    expect(c.map((x) => x.key)).toEqual(variants.map((x) => x.id));
    expect(c.find((x) => x.key === "black")).toEqual({ key: "black", label: "black", hex: "#111111", disabled: false });
    expect(c.find((x) => x.key === "pink")!.disabled).toBe(true);
    expect(hasColorChoice(c)).toBe(true);
    expect(hasColorChoice(studioColorChoices([v("white", "#ffffff")]))).toBe(false);
  });
});
