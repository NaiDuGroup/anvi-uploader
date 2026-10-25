import { describe, it, expect } from "vitest";
import {
  largeFormatTotalInkMl,
  lfRollLinearMetersForMaterial,
} from "./orderLineStock";

const midA = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const midB = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";

/** Large-format line with a minimal valid `largeFormatLineData` plus the given fields. */
function lfLineJson(materialId: string, extra: Record<string, unknown>) {
  return {
    productType: "large_format_print",
    largeFormatMaterialId: materialId,
    largeFormatLineData: {
      printWidthCm: 100,
      printHeightCm: 50,
      quantity: 1,
      materialSnapshot: { id: materialId },
      ...extra,
    },
  };
}

describe("lfRollLinearMetersForMaterial", () => {
  it("sums calculatedLinearMeters for matching material across LF lines", () => {
    expect(
      lfRollLinearMetersForMaterial(
        {
          orderLines: [
            lfLineJson(midA, { calculatedLinearMeters: 0.7 }),
            lfLineJson(midA, { calculatedLinearMeters: 1.2 }),
            lfLineJson(midB, { calculatedLinearMeters: 99 }),
            {
              productType: "mug",
              largeFormatMaterialId: null,
              largeFormatLineData: null,
            },
          ],
        },
        midA,
      ),
    ).toBeCloseTo(1.9, 6);
  });

  it("ignores non-numeric or missing layout fields in JSON", () => {
    expect(
      lfRollLinearMetersForMaterial(
        {
          orderLines: [
            lfLineJson(midA, {}),
            lfLineJson(midA, { calculatedLinearMeters: "bad" as unknown as number }),
          ],
        },
        midA,
      ),
    ).toBe(0);
  });

  it("returns 0 without order lines", () => {
    expect(lfRollLinearMetersForMaterial({}, midA)).toBe(0);
    expect(lfRollLinearMetersForMaterial({ orderLines: [] }, midA)).toBe(0);
  });
});

describe("largeFormatTotalInkMl", () => {
  it("sums inkMlUsed across LF lines only", () => {
    expect(
      largeFormatTotalInkMl({
        orderLines: [
          lfLineJson(midA, { inkMlUsed: 14 }),
          lfLineJson(midB, { inkMlUsed: 3.5 }),
          { productType: "mug", largeFormatMaterialId: null, largeFormatLineData: { inkMlUsed: 999 } },
        ],
      }),
    ).toBeCloseTo(17.5, 6);
  });

  it("ignores invalid ink fields", () => {
    expect(
      largeFormatTotalInkMl({
        orderLines: [
          lfLineJson(midA, { inkMlUsed: "nope" as unknown as number }),
        ],
      }),
    ).toBe(0);
  });
});
