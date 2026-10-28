import { describe, it, expect } from "vitest";
import { parseProductionCostsJson, inkMlPerSqmForPrintProcess } from "./types";

describe("parseProductionCostsJson", () => {
  it("merges legacy inkMlPerSqm into inkMlPerSqmLargeFormatRoll when new key absent", () => {
    const p = parseProductionCostsJson({
      mugPrintPerUnit: 1,
      inkMlPerSqm: 12.5,
    });
    expect(p.inkMlPerSqmLargeFormatRoll).toBe(12.5);
  });

  it("prefers explicit inkMlPerSqmLargeFormatRoll over legacy", () => {
    const p = parseProductionCostsJson({
      inkMlPerSqm: 99,
      inkMlPerSqmLargeFormatRoll: 3,
    });
    expect(p.inkMlPerSqmLargeFormatRoll).toBe(3);
  });

  it("drops the old UV / DTF / notebook-print keys (now on the print method pages and UV norms)", () => {
    const p = parseProductionCostsJson({ inkMlPerSqmUvRigid: 8, inkMlPerSqmDtfTextile: 15, notebookPrintPerUnit: 4 });
    expect(p).not.toHaveProperty("inkMlPerSqmUvRigid");
    expect(p).not.toHaveProperty("inkMlPerSqmDtfTextile");
    expect(p).not.toHaveProperty("notebookPrintPerUnit");
  });
});

describe("inkMlPerSqmForPrintProcess", () => {
  it("only the roll wide-format norm lives here; UV and DTF report 0", () => {
    const p = parseProductionCostsJson({ inkMlPerSqmLargeFormatRoll: 1 });
    expect(inkMlPerSqmForPrintProcess(p, "large_format_roll")).toBe(1);
    expect(inkMlPerSqmForPrintProcess(p, "uv_rigid")).toBe(0);
    expect(inkMlPerSqmForPrintProcess(p, "dtf_textile")).toBe(0);
  });
});
