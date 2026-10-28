import { describe, expect, it } from "vitest";
import { stockItemPrintArea } from "./stockItems";
import { DEFAULT_UV_PRINT_NORMS, parseUvPrintNorms, uvPrintNormsAttributes, uvPrintNormsSchema } from "./uvPrintNorms";

describe("UV print norms", () => {
  it("default to one underbase layer, no varnish, no primer", () => {
    expect(DEFAULT_UV_PRINT_NORMS).toEqual({ whiteLayers: 1, varnish: false, primer: false });
    expect(parseUvPrintNorms(null)).toEqual(DEFAULT_UV_PRINT_NORMS);
    expect(parseUvPrintNorms({ printWidthCm: 5 })).toEqual(DEFAULT_UV_PRINT_NORMS);
  });

  it("round-trip through item attributes next to the category fields", () => {
    const attrs = { printWidthCm: 5, printHeightCm: 0.6, ...uvPrintNormsAttributes({ whiteLayers: 2, varnish: true, primer: true }) };
    expect(parseUvPrintNorms(attrs)).toEqual({ whiteLayers: 2, varnish: true, primer: true });
    expect(stockItemPrintArea(attrs)).toEqual({ widthCm: 5, heightCm: 0.6 });
  });

  it("clamps layers to 0–5 and ignores bad values", () => {
    expect(parseUvPrintNorms({ uvWhiteLayers: 9, uvVarnish: "yes", uvPrimer: 1 })).toEqual({ whiteLayers: 5, varnish: false, primer: false });
    expect(parseUvPrintNorms({ uvWhiteLayers: 0 }).whiteLayers).toBe(0);
    expect(uvPrintNormsSchema.safeParse({ whiteLayers: 6, varnish: false, primer: false }).success).toBe(false);
  });
});
