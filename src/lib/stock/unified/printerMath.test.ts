import { describe, expect, it } from "vitest";
import { blendedInkCost, splitByShares, splitInkPartsBySlot, tonerCostPerSheet, tonerForSheets } from "./printerMath";

describe("splitByShares", () => {
  it("spreads ink by share", () => {
    expect(
      splitByShares(100, [
        { variantId: "c", share: 0.125 },
        { variantId: "w", share: 0.5 },
        { variantId: "k", share: 0.375 },
      ]),
    ).toEqual([
      { variantId: "c", quantity: 12.5 },
      { variantId: "w", quantity: 50 },
      { variantId: "k", quantity: 37.5 },
    ]);
  });

  it("normalises shares that don't add up to 1", () => {
    expect(splitByShares(10, [{ variantId: "a", share: 1 }, { variantId: "b", share: 3 }])).toEqual([
      { variantId: "a", quantity: 2.5 },
      { variantId: "b", quantity: 7.5 },
    ]);
  });

  it("skips empty slots and splits evenly when no shares are set", () => {
    expect(
      splitByShares(9, [
        { variantId: null, share: 0.5 },
        { variantId: "a", share: null },
        { variantId: "b", share: null },
        { variantId: "c", share: null },
      ]),
    ).toEqual([
      { variantId: "a", quantity: 3 },
      { variantId: "b", quantity: 3 },
      { variantId: "c", quantity: 3 },
    ]);
  });

  it("returns nothing for zero use or no loaded slots", () => {
    expect(splitByShares(0, [{ variantId: "a", share: 1 }])).toEqual([]);
    expect(splitByShares(5, [{ variantId: null, share: 1 }])).toEqual([]);
  });
});

describe("tonerForSheets", () => {
  it("uses 1/yield cartridge per sheet and skips slots without a yield", () => {
    expect(
      tonerForSheets(330, [
        { variantId: "c", sheetsPerUnit: 33000 },
        { variantId: "k", sheetsPerUnit: 41000 },
        { variantId: "m", sheetsPerUnit: null },
      ]),
    ).toEqual([
      { variantId: "c", quantity: 0.01 },
      { variantId: "k", quantity: 0.008049 },
    ]);
  });
});

describe("blendedInkCost", () => {
  it("weights colour costs by share", () => {
    expect(blendedInkCost([{ share: 0.5, unitCost: 1 }, { share: 0.5, unitCost: 3 }])).toBe(2);
    expect(blendedInkCost([{ share: 0.25, unitCost: 4 }, { share: 0.75, unitCost: 0 }])).toBe(1);
  });

  it("ignores colours without a known cost", () => {
    expect(blendedInkCost([{ share: 0.5, unitCost: 0.617 }, { share: 0.5, unitCost: null }])).toBe(0.617);
  });

  it("is null when nothing is known", () => {
    expect(blendedInkCost([{ share: 1, unitCost: null }])).toBeNull();
  });
});

describe("tonerCostPerSheet", () => {
  it("adds cartridge cost / yield over colours", () => {
    expect(
      tonerCostPerSheet([
        { unitCost: 3300, sheetsPerUnit: 33000 },
        { unitCost: 4100, sheetsPerUnit: 41000 },
        { unitCost: 1000, sheetsPerUnit: null },
      ]),
    ).toBeCloseTo(0.2, 10);
  });
});

describe("splitInkPartsBySlot", () => {
  const uvSlots = [
    { label: "Cyan", variantId: "c", share: 0.2 },
    { label: "Magenta", variantId: "m", share: 0.2 },
    { label: "Yellow", variantId: "y", share: 0.2 },
    { label: "Black", variantId: "k", share: 0.2 },
    { label: "White", variantId: "w", share: 0.15 },
    { label: "Varnish", variantId: "v", share: 0.05 },
  ];

  it("splits CMYK over the colour slots only and takes white / varnish from their slot", () => {
    expect(
      splitInkPartsBySlot(
        [
          { labels: ["Cyan", "Magenta", "Yellow", "Black"], amount: 8 },
          { labels: ["white"], amount: 3 },
          { labels: ["Varnish"], amount: 1.5 },
        ],
        uvSlots,
      ),
    ).toEqual([
      { variantId: "c", quantity: 2 },
      { variantId: "m", quantity: 2 },
      { variantId: "y", quantity: 2 },
      { variantId: "k", quantity: 2 },
      { variantId: "w", quantity: 3 },
      { variantId: "v", quantity: 1.5 },
    ]);
  });

  it("skips empty parts and parts without a loaded matching slot", () => {
    const slots = uvSlots.map((s) => (s.label === "Varnish" ? { ...s, variantId: null } : s));
    expect(
      splitInkPartsBySlot(
        [
          { labels: ["White"], amount: 0 },
          { labels: ["Varnish"], amount: 2 },
          { labels: ["Gold"], amount: 1 },
        ],
        slots,
      ),
    ).toEqual([]);
  });
});
