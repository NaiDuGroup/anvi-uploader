import { describe, expect, it } from "vitest";
import { categoryPrintsDtf, parsePrintMethods, PrintMethod, printMethodsSchema } from "./printMethods";

describe("printMethods", () => {
  it("accepts known methods, collapsing duplicates", () => {
    expect(printMethodsSchema.parse(["dtf", "dtf"])).toEqual([PrintMethod.Dtf]);
    expect(printMethodsSchema.parse([])).toEqual([]);
  });

  it("rejects unknown methods", () => {
    expect(printMethodsSchema.safeParse(["uv"]).success).toBe(false);
    expect(printMethodsSchema.safeParse("dtf").success).toBe(false);
  });

  it("reads the DB column tolerantly", () => {
    expect(parsePrintMethods(["legacy", "dtf"])).toEqual([PrintMethod.Dtf]);
    expect(parsePrintMethods(null)).toEqual([]);
    expect(categoryPrintsDtf({ printMethods: ["dtf"] })).toBe(true);
    expect(categoryPrintsDtf({ printMethods: [] })).toBe(false);
  });
});
