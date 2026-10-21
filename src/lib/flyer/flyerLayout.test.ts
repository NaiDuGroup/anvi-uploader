import { describe, expect, it } from "vitest";
import { computeBusinessCardSheetLayout } from "@/lib/businessCard/businessCardSheetLayout";
import { FLYER_BLEED_CM, FLYER_PRESETS } from "./flyerConstants";
import {
  findSheetProductPreset,
  isSheetProductPresetFor,
  sheetFootprintFromTrim,
  sheetProductConfig,
} from "@/lib/sheetProduct/sheetProductConfig";

const A4_PLUS = { sheetWidthCm: 22.5, sheetHeightCm: 32 };

function perSheet(trimWidthCm: number, trimHeightCm: number): number {
  return computeBusinessCardSheetLayout({
    ...A4_PLUS,
    ...sheetFootprintFromTrim(trimWidthCm, trimHeightCm, FLYER_BLEED_CM),
  }).cardsPerSheet;
}

describe("flyer imposition on A4+", () => {
  it("grows every flyer by 0.4 cm on width and height", () => {
    expect(sheetFootprintFromTrim(15, 7, FLYER_BLEED_CM)).toEqual({
      cardWidthCm: 15.4,
      cardHeightCm: 7.4,
    });
  });

  it.each([
    ["flyer_a6", 4],
    ["flyer_a5", 2],
    ["flyer_dl", 3],
    ["flyer_a4", 1],
    // Turned 90°: 3 × 2 beats 1 × 4 upright.
    ["flyer_150x70", 6],
  ] as const)("%s fits %i per sheet", (id, expected) => {
    const preset = FLYER_PRESETS.find((p) => p.id === id)!;
    expect(perSheet(preset.trimWidthCm, preset.trimHeightCm)).toBe(expected);
  });
});

describe("sheet product config", () => {
  it("keeps business-card and flyer presets apart", () => {
    expect(isSheetProductPresetFor("flyer", "flyer_a6")).toBe(true);
    expect(isSheetProductPresetFor("flyer", "custom")).toBe(true);
    expect(isSheetProductPresetFor("business_card", "flyer_a6")).toBe(false);
    expect(findSheetProductPreset("flyer", "flyer_dl")?.name).toBe("DL");
  });

  it("generates flyer bleed and skips the business-card minimum", () => {
    const flyer = sheetProductConfig("flyer");
    expect(flyer.generatesMissingBleed).toBe(true);
    expect(flyer.appliesMinimumLineTotal).toBe(false);
    expect(flyer.bleedCm).toBe(0.2);
    expect(sheetProductConfig("business_card").generatesMissingBleed).toBe(false);
  });
});
