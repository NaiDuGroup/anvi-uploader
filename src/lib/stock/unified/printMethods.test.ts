import { describe, expect, it } from "vitest";
import {
  categoryPrintsDtf,
  categoryPrintsSublimation,
  categoryPrintsUv,
  parsePrintMethods,
  PrintMethod,
  printMethodsSchema,
  priceTierScope,
} from "./printMethods";

describe("printMethods", () => {
  it("accepts known methods, collapsing duplicates", () => {
    expect(printMethodsSchema.parse(["dtf", "dtf"])).toEqual([PrintMethod.Dtf]);
    expect(printMethodsSchema.parse([])).toEqual([]);
    expect(printMethodsSchema.parse(["uv", "dtf", "uv"])).toEqual([PrintMethod.Dtf, PrintMethod.Uv]);
  });

  it("rejects unknown methods", () => {
    expect(printMethodsSchema.parse(["sublimation", "uv"])).toEqual([PrintMethod.Uv, PrintMethod.Sublimation]);
    expect(printMethodsSchema.safeParse(["laser"]).success).toBe(false);
    expect(printMethodsSchema.safeParse("dtf").success).toBe(false);
  });

  it("reads the DB column tolerantly", () => {
    expect(parsePrintMethods(["legacy", "dtf"])).toEqual([PrintMethod.Dtf]);
    expect(parsePrintMethods(null)).toEqual([]);
    expect(categoryPrintsDtf({ printMethods: ["dtf"] })).toBe(true);
    expect(categoryPrintsDtf({ printMethods: [] })).toBe(false);
    expect(parsePrintMethods(["uv", "x"])).toEqual([PrintMethod.Uv]);
    expect(categoryPrintsUv({ printMethods: ["uv"] })).toBe(true);
    expect(categoryPrintsUv({ printMethods: ["dtf"] })).toBe(false);
  });
});

describe("sublimation and price tier scope", () => {
  it("keeps «sublimation» when reading the column", () => {
    expect(parsePrintMethods(["sublimation", "legacy"])).toEqual([PrintMethod.Sublimation]);
    expect(categoryPrintsSublimation({ printMethods: ["sublimation"] })).toBe(true);
    expect(categoryPrintsSublimation({ printMethods: ["uv"] })).toBe(false);
  });

  it("DTF tiers are per colour, other printed blanks per variant, unprinted categories have none", () => {
    expect(priceTierScope({ printMethods: ["dtf"] })).toBe("color");
    expect(priceTierScope({ printMethods: ["dtf", "uv"] })).toBe("color");
    expect(priceTierScope({ printMethods: ["uv"] })).toBe("variant");
    expect(priceTierScope({ printMethods: ["sublimation"] })).toBe("variant");
    expect(priceTierScope({ printMethods: [] })).toBeNull();
    expect(priceTierScope({ printMethods: ["legacy"] })).toBeNull();
  });
});
