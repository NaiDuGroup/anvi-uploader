import { describe, expect, it } from "vitest";
import {
  MUG_DEFAULT_PRINT,
  NOTEBOOK_DEFAULT_PRINT,
  cmToPx,
  pxFromProduct,
  pxToCm,
} from "./printDimensions";

describe("printDimensions.cmToPx", () => {
  it("returns the legacy mug canvas (21 x 9.6 cm @ 300 DPI = 2480 x 1134 px)", () => {
    expect(cmToPx(MUG_DEFAULT_PRINT.widthCm, 300)).toBe(2480);
    expect(cmToPx(MUG_DEFAULT_PRINT.heightCm, 300)).toBe(1134);
  });

  it("returns the legacy notebook canvas (14 x 21.4 cm @ 300 DPI = 1654 x 2528 px)", () => {
    expect(cmToPx(NOTEBOOK_DEFAULT_PRINT.widthCm, 300)).toBe(1654);
    expect(cmToPx(NOTEBOOK_DEFAULT_PRINT.heightCm, 300)).toBe(2528);
  });

  it("scales linearly with DPI", () => {
    expect(cmToPx(10, 150)).toBe(591);
    expect(cmToPx(10, 300)).toBe(1181);
    expect(cmToPx(10, 600)).toBe(2362);
  });
});

describe("printDimensions.pxToCm", () => {
  it("round-trips with cmToPx within the rounding tolerance", () => {
    const cm = 14;
    const px = cmToPx(cm, 300);
    expect(pxToCm(px, 300)).toBeCloseTo(cm, 2);
  });
});

describe("printDimensions.pxFromProduct", () => {
  it("accepts plain number columns", () => {
    expect(
      pxFromProduct({ printWidthCm: 14, printHeightCm: 21.4, printDpi: 300 }),
    ).toEqual({ width: 1654, height: 2528 });
  });

  it("accepts Decimal-like objects (Prisma) and string serialisations", () => {
    const decimalLike = { toString: () => "21.0" };
    expect(
      pxFromProduct({
        printWidthCm: decimalLike,
        printHeightCm: "9.6",
        printDpi: 300,
      }),
    ).toEqual({ width: 2480, height: 1134 });
  });
});
