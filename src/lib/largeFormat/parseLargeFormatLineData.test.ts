import { describe, expect, it } from "vitest";
import { parseLargeFormatLineData } from "./parseLargeFormatLineData";

describe("parseLargeFormatLineData", () => {
  it("returns null for non-objects", () => {
    expect(parseLargeFormatLineData(null)).toBeNull();
    expect(parseLargeFormatLineData(undefined)).toBeNull();
    expect(parseLargeFormatLineData("x")).toBeNull();
    expect(parseLargeFormatLineData(1)).toBeNull();
  });

  it("returns null when required dimensions or snapshot are missing", () => {
    expect(parseLargeFormatLineData({})).toBeNull();
    expect(
      parseLargeFormatLineData({
        printWidthCm: 10,
        printHeightCm: 20,
        quantity: 1,
      }),
    ).toBeNull();
    expect(
      parseLargeFormatLineData({
        printWidthCm: 10,
        printHeightCm: 20,
        quantity: 1,
        materialSnapshot: null,
      }),
    ).toBeNull();
  });

  it("returns null when core fields have wrong types", () => {
    expect(
      parseLargeFormatLineData({
        printWidthCm: "10",
        printHeightCm: 20,
        quantity: 1,
        materialSnapshot: {},
      }),
    ).toBeNull();
  });

  it("accepts minimal valid payload", () => {
    const raw = {
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 2,
      materialSnapshot: { id: "a" },
      calculatedLinearMeters: 0.7,
    };
    const parsed = parseLargeFormatLineData(raw);
    expect(parsed).toBe(raw);
    expect(parsed?.calculatedLinearMeters).toBe(0.7);
  });
});
