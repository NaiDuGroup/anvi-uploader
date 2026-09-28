/**
 * Tests for material family billing: min-sufficient roll selection.
 */

import { describe, it, expect } from "vitest";
import { pickBillingRoll } from "./lfFamilyBilling";
import { usesFamilyBilling } from "./lfMaterialFamilyUi";
import type { LfFamilyRollCandidate } from "./lfFamilyBilling";

describe("usesFamilyBilling", () => {
  it("returns true for ORACAL MATT", () => {
    expect(usesFamilyBilling("ORACAL MATT")).toBe(true);
  });

  it("returns false for other families", () => {
    expect(usesFamilyBilling("Some Other Material")).toBe(false);
    expect(usesFamilyBilling("Canvas")).toBe(false);
  });
});

describe("pickBillingRoll", () => {
  const roll105: LfFamilyRollCandidate = {
    id: "roll-105",
    name: "ORACAL MATT 1.05*50m",
    rollWidthMeters: "1.05",
    printableWidthMeters: null,
    isActive: true,
    sortOrder: 0,
  };

  const roll127: LfFamilyRollCandidate = {
    id: "roll-127",
    name: "ORACAL MATT 1.27*50m",
    rollWidthMeters: "1.27",
    printableWidthMeters: null,
    isActive: true,
    sortOrder: 0,
  };

  const roll162: LfFamilyRollCandidate = {
    id: "roll-162",
    name: "ORACAL MATT 1.62*50m",
    rollWidthMeters: "1.62",
    printableWidthMeters: null,
    isActive: true,
    sortOrder: 0,
  };

  it("picks the narrowest roll that fits", () => {
    // Artwork: 100×100 cm (fits all three rolls after default trim).
    const result = pickBillingRoll({
      familyRolls: [roll105, roll127, roll162],
      printWidthCm: 100,
      printHeightCm: 100,
      quantity: 1,
    });

    expect(result.billingRoll).not.toBeNull();
    expect(result.billingRoll?.id).toBe("roll-105");
    expect(result.fittingRolls).toHaveLength(3);
    expect(result.tooNarrowRolls).toHaveLength(0);
  });

  it("skips too-narrow rolls and picks the next available", () => {
    // Artwork: 110×105 cm (both dims > 100cm, so can't fit 1.05 even rotated).
    // After default 5cm trim: 1.05m → 100cm, 1.27m → 122cm, 1.62m → 157cm.
    // 105cm along width is too wide for 1.05 but fits 1.27.
    const result = pickBillingRoll({
      familyRolls: [roll105, roll127, roll162],
      printWidthCm: 110,
      printHeightCm: 105,
      quantity: 1,
    });

    expect(result.billingRoll).not.toBeNull();
    expect(result.billingRoll?.id).toBe("roll-127");
    expect(result.fittingRolls).toHaveLength(2);
    expect(result.fittingRolls.map((r) => r.id)).toEqual(["roll-127", "roll-162"]);
    expect(result.tooNarrowRolls).toHaveLength(1);
    expect(result.tooNarrowRolls[0]?.id).toBe("roll-105");
  });

  it("returns null when no rolls fit", () => {
    // Artwork: 200×180 cm (both dims > 157cm, too wide for all rolls even 1.62).
    const result = pickBillingRoll({
      familyRolls: [roll105, roll127, roll162],
      printWidthCm: 200,
      printHeightCm: 180,
      quantity: 1,
    });

    expect(result.billingRoll).toBeNull();
    expect(result.fittingRolls).toHaveLength(0);
    expect(result.tooNarrowRolls).toHaveLength(3);
  });

  it("handles wide pieces requiring wider rolls", () => {
    // Artwork: 130×125 cm (both dims > 122cm, so can't fit 1.27 even rotated).
    // Requires 1.62 (157cm printable) to fit.
    const result = pickBillingRoll({
      familyRolls: [roll105, roll127, roll162],
      printWidthCm: 130,
      printHeightCm: 125,
      quantity: 1,
    });

    expect(result.billingRoll).not.toBeNull();
    expect(result.billingRoll?.id).toBe("roll-162");
    expect(result.fittingRolls).toHaveLength(1);
    expect(result.tooNarrowRolls).toHaveLength(2);
  });

  it("handles exactly printable width (edge case)", () => {
    // Assuming default trim of ~2cm per side, 1.05m roll has ~101cm printable.
    // Test artwork slightly under printable limit.
    const result = pickBillingRoll({
      familyRolls: [roll105, roll127, roll162],
      printWidthCm: 101,
      printHeightCm: 50,
      quantity: 1,
    });

    expect(result.billingRoll).not.toBeNull();
    expect(result.billingRoll?.id).toBe("roll-105");
  });

  it("handles slightly over printable width (edge case)", () => {
    // Artwork: 103×102 cm (both dims slightly over 100cm printable of 1.05).
    // Can't fit 1.05 even with rotation, should pick 1.27.
    const result = pickBillingRoll({
      familyRolls: [roll105, roll127, roll162],
      printWidthCm: 103,
      printHeightCm: 102,
      quantity: 1,
    });

    expect(result.billingRoll).not.toBeNull();
    expect(result.billingRoll?.id).toBe("roll-127");
  });

  it("120×140 cm picks 1.27 not 1.05 (admin new-order live bug)", () => {
    // Default trim 5cm: 1.05→100cm, 1.27→122cm, 1.62→157cm printable.
    // 120 fits across 1.27 (122); 140 runs along the roll. Must NOT stick on 1.05.
    const result = pickBillingRoll({
      familyRolls: [roll105, roll127, roll162],
      printWidthCm: 120,
      printHeightCm: 140,
      quantity: 1,
    });

    expect(result.billingRoll).not.toBeNull();
    expect(result.billingRoll?.id).toBe("roll-127");
    expect(result.billingRoll?.id).not.toBe("roll-105");
    expect(result.tooNarrowRolls.map((r) => r.id)).toContain("roll-105");
    expect(result.fittingRolls.map((r) => r.id)).toEqual(["roll-127", "roll-162"]);
  });

  it("returns empty when family has no rolls", () => {
    const result = pickBillingRoll({
      familyRolls: [],
      printWidthCm: 100,
      printHeightCm: 100,
      quantity: 1,
    });

    expect(result.billingRoll).toBeNull();
    expect(result.fittingRolls).toHaveLength(0);
    expect(result.tooNarrowRolls).toHaveLength(0);
  });
});
