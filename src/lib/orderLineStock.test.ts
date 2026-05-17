import { describe, it, expect } from "vitest";
import {
  largeFormatTotalInkMl,
  lfRollLinearMetersForMaterial,
  mugOrderStockQtyForProduct,
  notebookOrderStockQtyForProduct,
} from "./orderLineStock";

const pidM = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const pidN = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const pidOther = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";

describe("mugOrderStockQtyForProduct", () => {
  it("uses legacy order row when no orderLines", () => {
    expect(
      mugOrderStockQtyForProduct(
        {
          productType: "mug",
          mugProductId: pidM,
          files: [{ copies: 3 }, { copies: 2 }],
        },
        pidM,
      ),
    ).toBe(5);
  });

  it("returns 0 for other product id on legacy order", () => {
    expect(
      mugOrderStockQtyForProduct(
        {
          productType: "mug",
          mugProductId: pidM,
          files: [{ copies: 1 }],
        },
        pidOther,
      ),
    ).toBe(0);
  });

  it("sums qty across matching order lines only", () => {
    expect(
      mugOrderStockQtyForProduct(
        {
          productType: "mixed",
          mugProductId: null,
          files: [],
          orderLines: [
            {
              productType: "mug",
              mugProductId: pidM,
              notebookProductId: null,
              files: [{ copies: 2 }],
            },
            {
              productType: "mug",
              mugProductId: pidOther,
              notebookProductId: null,
              files: [{ copies: 9 }],
            },
            {
              productType: "mug",
              mugProductId: pidM,
              notebookProductId: null,
              files: [{ copies: 4 }],
            },
          ],
        },
        pidM,
      ),
    ).toBe(6);
  });
});

describe("notebookOrderStockQtyForProduct", () => {
  it("uses legacy order row when no orderLines", () => {
    expect(
      notebookOrderStockQtyForProduct(
        {
          productType: "notebook",
          notebookProductId: pidN,
          files: [{ copies: 7 }],
        },
        pidN,
      ),
    ).toBe(7);
  });

  it("sums matching lines when orderLines present", () => {
    expect(
      notebookOrderStockQtyForProduct(
        {
          productType: "notebook",
          notebookProductId: pidN,
          files: [{ copies: 99 }],
          orderLines: [
            {
              productType: "notebook",
              mugProductId: null,
              notebookProductId: pidN,
              files: [{ copies: 1 }],
            },
            {
              productType: "notebook",
              mugProductId: null,
              notebookProductId: pidOther,
              files: [{ copies: 100 }],
            },
            {
              productType: "notebook",
              mugProductId: null,
              notebookProductId: pidN,
              files: [{ copies: 2 }],
            },
          ],
        },
        pidN,
      ),
    ).toBe(3);
  });
});

const midA = "11111111-1111-4111-8111-111111111111";
const midB = "22222222-2222-4222-8222-222222222222";

function lfLineJson(
  materialId: string,
  extras: Record<string, unknown>,
): {
  productType: string;
  largeFormatMaterialId: string;
  largeFormatLineData: Record<string, unknown>;
} {
  return {
    productType: "large_format_print",
    largeFormatMaterialId: materialId,
    largeFormatLineData: {
      printWidthCm: 1,
      printHeightCm: 1,
      quantity: 1,
      materialSnapshot: {},
      ...extras,
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
