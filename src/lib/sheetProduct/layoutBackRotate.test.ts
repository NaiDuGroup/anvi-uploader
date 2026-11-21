import { describe, expect, it } from "vitest";
import { sheetProductConfig } from "./sheetProductConfig";

describe("Ricoh layout PDF back-page turn", () => {
  it("business cards: back laid out the same way up as the front (workshop, 2026-11-21)", () => {
    expect(sheetProductConfig("business_card").layoutBackRotateDeg).toBe(0);
  });
  it("flyers and postcards keep the 180° turn", () => {
    expect(sheetProductConfig("flyer").layoutBackRotateDeg).toBe(180);
    expect(sheetProductConfig("postcard").layoutBackRotateDeg).toBe(180);
  });
});
